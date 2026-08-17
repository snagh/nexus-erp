import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from './lib/supabase'
import { toast } from 'sonner'
import { 
  Search, 
  FileDown, 
  Trash2, 
  AlertCircle, 
  ExternalLink,
  History,
  Calendar,
  Package,
  Loader2,
  Link as LinkIcon,
  X,
  Pencil,
  FileSpreadsheet,
  FileText,
  Building2,
  DollarSign,
  PieChart,
  ShieldAlert
 } from 'lucide-react'
import { fetchAbatimentosItem, fetchSaldoAta, checkAtaConsumption } from './lib/supabaseHelpers'
import { getCleanPublicUrl } from './lib/storage'
import { ModalVincularVenda } from './components/Vendas/ModalVincularVenda'
import { useAuth } from './AuthContext'
import { canDeleteAta } from './lib/permissions'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog'
import { Textarea } from './components/ui/textarea'
import { Label } from './components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// Shadcn UI Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table"
import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"
import { Badge } from "./components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card"
import { SecurityConfirmDialog } from './components/SecurityConfirmDialog'
import { logAction } from './lib/logger'

import { SUBCATEGORIAS_OPCOES } from './lib/subcatResolver'

interface ItemAta {
  id: number
  ata_id: string
  numero_item: string
  descricao: string
  unidade: string
  quantidade_registrada: number
  valor_unitario: number
  quantidade_empenhada?: number
  quantidade_consumida?: number
  saldo_real?: number
  saldo_disponivel?: number
  marca?: string | null
  categoria?: string | null
  subcategoria?: string | null
}

interface Ata {
  id: string
  numero_arp: string
  entidade_gerenciadora: string | null
  entidade_id: string | null
  data_assinatura?: string | null
  valor_global: number | null
  data_validade: string | null
  arquivo_caminho: string | null
  uf: string | null
  objeto_ata?: string | null
  subcategoria?: string | null
  tipo_documento?: string | null
  parent_ata_id?: string | null
  created_at: string
  itens?: ItemAta[]
  assigned_to?: string | null
  owner_id?: string | null
  assigned_user?: { display_name: string | null } | null
}

const OBJETO_ATA_COLORS: Record<string, string> = {
  'Medicamento': 'bg-violet-100 text-violet-700 border-violet-200',
  'Material Hospitalar': 'bg-blue-100 text-blue-700 border-blue-200',
  'Odonto': 'bg-teal-100 text-teal-700 border-teal-200',
  'Mobiliário': 'bg-orange-100 text-orange-700 border-orange-200',
  'Eletrônico': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Misto': 'bg-zinc-100 text-zinc-600 border-zinc-200',
}
function ItemDetalheTable({ itens, loading, onRefresh }: { itens: ItemAta[], loading: boolean, onRefresh?: () => void }) {
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null)
  const [history, setHistory] = useState<Record<number, any[]>>({})
  const [loadingHistory, setLoadingHistory] = useState<Record<number, boolean>>({})
  const [vendaParaVincular, setVendaParaVincular] = useState<any>(null)
  const [isModalVincularOpen, setIsModalVincularOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [sortByCompletude, setSortByCompletude] = useState<'none' | 'urgente' | 'atendido'>('none')

  // Item description editing states
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editingItemDesc, setEditingItemDesc] = useState('')
  const [savingItemId, setSavingItemId] = useState<number | null>(null)

  const handleSaveItemDesc = async (itemId: number) => {
    if (!editingItemDesc.trim()) {
      toast.error('A descrição do item não pode ser vazia.')
      return
    }
    setSavingItemId(itemId)
    try {
      const { error } = await supabase
        .from('itens_ata')
        .update({ descricao: editingItemDesc.trim() })
        .eq('id', itemId)
      if (error) throw error

      toast.success('Descrição do item atualizada com sucesso!')
      setEditingItemId(null)
      if (onRefresh) onRefresh()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar descrição: ' + err.message)
    } finally {
      setSavingItemId(null)
    }
  }

  // Pedidos de compra state
  const [pedidos, setPedidos] = useState<any[]>([])

  // Solicitar compra manual states
  const [solicitarItem, setSolicitarItem] = useState<ItemAta | null>(null)
  const [solicitarQtd, setSolicitarQtd] = useState<number>(0)
  const [solicitarPrazo, setSolicitarPrazo] = useState<string>('')
  const [solicitarObs, setSolicitarObs] = useState('')
  const [solicitarMarca, setSolicitarMarca] = useState('')
  const [solicitarLoading, setSolicitarLoading] = useState(false)

  const fetchPedidos = React.useCallback(async () => {
    if (!itens || itens.length === 0) {
      setPedidos([])
      return
    }
    try {
      const ids = itens.map(i => i.id)
      const { data, error } = await supabase
        .from('pedidos_compra')
        .select('*')
        .in('item_ata_id', ids)
      if (error) throw error
      setPedidos(data || [])
    } catch (err) {
      console.error('Erro ao buscar pedidos de compra das atas:', err)
    }
  }, [itens])

  useEffect(() => {
    fetchPedidos()
  }, [fetchPedidos])

  async function toggleHistory(itemId: number) {
    if (expandedItemId === itemId) {
        setExpandedItemId(null)
        return
    }
    
    setExpandedItemId(itemId)
    if (history[itemId]) return

    setLoadingHistory(prev => ({ ...prev, [itemId]: true }))
    try {
      const { data } = await fetchAbatimentosItem(itemId)
      setHistory(prev => ({ ...prev, [itemId]: data || [] }))
    } catch (err) {
      toast.error('Erro ao carregar histórico')
    } finally {
      setLoadingHistory(prev => ({ ...prev, [itemId]: false }))
    }
  }

  const handleSolicitarCompra = (item: ItemAta) => {
    const saldo = item.saldo_real || 0
    if (saldo <= 0) {
      toast.error('Este item não possui saldo real disponível.')
      return
    }
    setSolicitarItem(item)
    setSolicitarQtd(saldo)
    const d = new Date()
    d.setDate(d.getDate() + 7)
    setSolicitarPrazo(d.toISOString().split('T')[0])
    setSolicitarObs('')
    setSolicitarMarca('')
  }

  const handleConfirmSolicitar = async () => {
    if (!solicitarItem) return
    const saldo = solicitarItem.saldo_real || 0
    if (solicitarQtd <= 0) {
      toast.error('A quantidade solicitada deve ser maior que zero.')
      return
    }
    if (solicitarQtd > saldo) {
      toast.error(`A quantidade solicitada não pode exceder o saldo real de ${saldo}.`)
      return
    }
    if (!solicitarPrazo) {
      toast.error('O prazo limite é obrigatório.')
      return
    }

    setSolicitarLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const usuarioNome = user?.email || 'Manual (Ata)'

      const obsPayload = JSON.stringify({
        marca: solicitarMarca.trim() || null,
        observacao: solicitarObs.trim() || null
      })

      const { error } = await supabase
        .from('pedidos_compra')
        .insert([{
          item_ata_id: solicitarItem.id,
          quantidade_solicitada: solicitarQtd,
          prazo_limite: new Date(solicitarPrazo + 'T23:59:59').toISOString(),
          observacoes: obsPayload,
          usuario_solicitante: usuarioNome,
          status: 'PENDENTE'
        }])
      
      if (error) throw error

      await logAction('SOLICITACAO_COMPRA_ATA', 'itens_ata', solicitarItem.id, { 
        acao: 'SOLICITAR_MANUAL', 
        quantidade: solicitarQtd, 
        prazo: solicitarPrazo, 
        marca: solicitarMarca,
        obs: solicitarObs 
      })

      toast.success('Solicitação de compra via ATA criada com sucesso!')
      setSolicitarItem(null)
      fetchPedidos()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar solicitação: ' + err.message)
    } finally {
      setSolicitarLoading(false)
    }
  }

  const handleCancelarCompra = async (pedidoId: number) => {
    try {
      const { error } = await supabase
        .from('pedidos_compra')
        .delete()
        .eq('id', pedidoId)
      
      if (error) throw error

      toast.success('Solicitação de compra cancelada!')
      fetchPedidos()
    } catch (err: any) {
      toast.error('Erro ao cancelar solicitação: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p>Carregando itens da Ata...</p>
      </div>
    )
  }

  if (!itens || itens.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-zinc-400">
        <AlertCircle className="w-10 h-10 mb-2 opacity-20" />
        <p>Nenhum item processado para esta Ata.</p>
      </div>
    )
  }

  const filteredItens = (() => {
    const base = itens.filter(item =>
      item.descricao.toLowerCase().includes(itemSearch.toLowerCase()) ||
      item.numero_item.toString().includes(itemSearch)
    )
    if (sortByCompletude === 'none') return base
    return [...base].sort((a, b) => {
      const pctA = a.quantidade_registrada > 0 ? (a.quantidade_consumida || 0) / a.quantidade_registrada : 0
      const pctB = b.quantidade_registrada > 0 ? (b.quantidade_consumida || 0) / b.quantidade_registrada : 0
      if (sortByCompletude === 'urgente') {
        return pctA - pctB
      } else {
        return pctB - pctA
      }
    })
  })()

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400" />
          <Input 
            placeholder="Buscar item por nome ou número..." 
            className="h-8 text-xs bg-white dark:bg-zinc-950"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
          />
        </div>
        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          {filteredItens.length} de {itens.length} itens localizados
        </div>
        <button
          onClick={() => {
            setSortByCompletude(prev => {
              if (prev === 'none') return 'urgente'
              if (prev === 'urgente') return 'atendido'
              return 'none'
            })
          }}
          title={
            sortByCompletude === 'urgente' 
              ? 'Ordenado: Mais Urgentes (clique para ordenar por Mais Atendidos)' 
              : sortByCompletude === 'atendido'
              ? 'Ordenado: Mais Atendidos (clique para remover ordenação)'
              : 'Ordenar por % de Atendimento (Urgência)'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${
            sortByCompletude !== 'none'
              ? 'bg-brand-accent text-white border-brand-accent shadow-sm'
              : 'bg-white dark:bg-zinc-950 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-brand-accent hover:text-brand-accent'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M7 12h10M11 18h2" /></svg>
          {sortByCompletude === 'urgente' 
            ? 'Mais Urgentes (Menos Atendidos)' 
            : sortByCompletude === 'atendido'
            ? 'Mais Atendidos (% Alto)'
            : 'Ordenar por Urgência'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
        <Table>
          <TableHeader className="bg-zinc-100 dark:bg-zinc-900/50">
            <TableRow className="text-[10px] uppercase font-bold tracking-wider">
                <TableHead>Item</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Qtd Registrada</TableHead>
                <TableHead className="text-right">Empenhado (Baixa Suave)</TableHead>
                <TableHead className="text-right">Entregue (NF/DAV)</TableHead>
                <TableHead className="text-right">Saldo Livre p/ Empenhar</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-center">Compra</TableHead>
                <TableHead className="text-center">Histórico</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {filteredItens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-zinc-400 text-xs italic">
                  Nenhum item corresponde à sua busca "{itemSearch}"
                </TableCell>
              </TableRow>
            ) : filteredItens.map((item) => {
              const empenhado = item.quantidade_empenhada || 0
              const pctEmpenhado = item.quantidade_registrada > 0 ? (empenhado / item.quantidade_registrada) * 100 : 0
              const consumed = item.quantidade_consumida || 0
              const percent = item.quantidade_registrada > 0 ? (consumed / item.quantidade_registrada) * 100 : 0
              const saldoLivre = item.saldo_disponivel !== undefined ? item.saldo_disponivel : (item.quantidade_registrada - empenhado)
              const isExpanded = expandedItemId === item.id

              return (
                <React.Fragment key={item.id}>
                  <TableRow className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-bold">#{item.numero_item}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[400px] font-medium text-xs py-3 leading-relaxed">
                      {editingItemId === item.id ? (
                        <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Textarea
                            value={editingItemDesc}
                            onChange={(e) => setEditingItemDesc(e.target.value)}
                            className="text-xs min-h-[60px] p-1.5 w-full bg-white dark:bg-zinc-950 border-brand-accent focus-visible:ring-1 focus-visible:ring-brand-accent"
                          />
                          <div className="flex gap-1 justify-end">
                            <Button 
                              size="sm" 
                              className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleSaveItemDesc(item.id)}
                              disabled={savingItemId === item.id}
                            >
                              {savingItemId === item.id ? 'Salvando...' : 'Salvar'}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-6 px-2 text-[10px]"
                              onClick={() => setEditingItemId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-start gap-1">
                          <span className="flex-1">{item.descricao}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-brand-accent rounded transition-opacity shrink-0"
                            title="Editar descrição do item"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingItemId(item.id)
                              setEditingItemDesc(item.descricao)
                            }}
                          >
                            <Pencil className="w-3 h-3" strokeWidth={2.5} />
                          </Button>
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-400 mt-0.5 font-mono uppercase">{item.unidade}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] bg-zinc-100 text-zinc-600 border-zinc-200">
                        {item.marca || 'S/ MARCA'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.quantidade_registrada}</TableCell>

                    {/* Empenhado (Baixa Suave) */}
                    <TableCell className="text-right font-mono text-xs">
                      <div className="flex items-center justify-end gap-1 px-1">
                        <span className="font-bold text-purple-600 dark:text-purple-400">{empenhado}</span>
                        <span className="text-[10px] text-zinc-400 font-bold">({Math.round(pctEmpenhado)}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${pctEmpenhado > 90 ? 'bg-amber-500' : 'bg-purple-500'}`} 
                          style={{ width: `${Math.min(100, pctEmpenhado)}%` }}
                        />
                      </div>
                    </TableCell>

                    {/* Entregue (Baixa Definitiva por NF/DAV) */}
                    <TableCell className="text-right font-mono text-xs text-brand-accent">
                      <div className="flex items-center justify-end gap-1 px-1">
                        <span className="font-bold">{consumed}</span>
                        <span className="text-[10px] text-zinc-400 font-bold">({Math.round(percent)}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${percent > 90 ? 'bg-red-500' : 'bg-brand-accent'}`} 
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </TableCell>

                    {/* Saldo Livre para novos Empenhos */}
                    <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {saldoLivre}
                    </TableCell>

                    <TableCell className="text-right font-bold text-xs text-brand-accent">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario)}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const pedido = pedidos.find(p => p.item_ata_id === item.id)
                        if (!pedido) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1 px-2 border-dashed border-brand-accent text-brand-accent hover:bg-brand-accent/5 hover:text-brand-accent"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSolicitarCompra(item)
                              }}
                            >
                              Solicitar
                            </Button>
                          )
                        }

                        const status = (pedido.status || 'SOLICITADO').toUpperCase()
                        if (status === 'COMPRADO') {
                          return (
                            <Badge variant="outline" className="text-[9px] font-black text-emerald-700 bg-emerald-50 border-emerald-200">
                              COMPRADO
                            </Badge>
                          )
                        }
                        if (status === 'COTACAO') {
                          return (
                            <Badge variant="outline" className="text-[9px] font-black text-blue-700 bg-blue-50 border-blue-200">
                              EM COTAÇÃO
                            </Badge>
                          )
                        }
                        if (status === 'ATENDIDO') {
                          return (
                            <Badge variant="outline" className="text-[9px] font-black text-zinc-500 bg-zinc-100 border-zinc-200">
                              ATENDIDO
                            </Badge>
                          )
                        }
                        
                        return (
                          <div className="flex items-center justify-center gap-1">
                            <Badge variant="outline" className="text-[9px] font-black text-amber-700 bg-amber-50 border-amber-200 animate-pulse">
                              SOLICITADO
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-zinc-400 hover:text-red-500 rounded-full"
                              title="Cancelar solicitação de compra"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelarCompra(pedido.id)
                              }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${isExpanded ? 'bg-zinc-100 dark:bg-zinc-800 text-brand-accent' : ''}`}
                        onClick={() => toggleHistory(item.id)}
                      >
                        <History className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-zinc-50 dark:bg-black/20 border-b-2 border-brand-accent shadow-inner">
                      <TableCell colSpan={10} className="p-4">
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-black uppercase text-zinc-400 mb-1 flex items-center gap-1.5 px-2">
                             <ExternalLink className="w-3 h-3" /> Origem do Abatimento (Empenhos/NEs Vinculados)
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {loadingHistory[item.id] ? (
                              <div className="col-span-full py-4 flex items-center justify-center gap-2 text-zinc-400 text-[10px]">
                                <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
                              </div>
                            ) : history[item.id]?.length > 0 ? history[item.id].map((h, idx) => {
                              const isDirect = !h.item
                              return (
                                <div key={idx} className={`border p-2.5 rounded-md flex flex-col shadow-sm ${isDirect ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
                                  <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[10px] font-black ${isDirect ? 'text-amber-600' : 'text-brand-accent'}`}>
                                      {isDirect ? `VENDA DIRETA: ${h.numero_nf || 'S/NF'}` : `NE: ${h.item?.nota?.numero_ne || 'N/A'}`}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {isDirect && (
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-5 px-1.5 text-[8px] bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold border border-amber-200"
                                          onClick={() => {
                                            setVendaParaVincular({ ...h, item_ata: item })
                                            setIsModalVincularOpen(true)
                                          }}
                                        >
                                          <LinkIcon className="w-2.5 h-2.5 mr-1" />
                                          VINCULAR EMPENHO
                                        </Button>
                                      )}
                                      <span className="text-[10px] font-black text-emerald-600">+{h.quantidade_entregue}</span>
                                    </div>
                                  </div>
                                  <div className="text-[9px] text-zinc-500 font-medium">
                                    {isDirect ? (h.motivo_pendencia || 'Venda pré-faturada') : h.item?.nota?.emissor}
                                  </div>
                                  <div className="text-[8px] text-zinc-400 mt-1 flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5" /> {new Date(h.created_at).toLocaleDateString('pt-BR')} {new Date(h.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              )
                            }) : (
                              <div className="col-span-full py-4 text-center text-[10px] text-zinc-400">
                                Nenhum consumo registrado ainda. O saldo deste item permanece integral.
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>

    {vendaParaVincular && (
      <ModalVincularVenda 
        venda={vendaParaVincular}
        isOpen={isModalVincularOpen}
        onClose={() => {
          setIsModalVincularOpen(false)
          setVendaParaVincular(null)
        }}
        onSuccess={() => {
          if (vendaParaVincular.item_ata_id) {
            fetchAbatimentosItem(vendaParaVincular.item_ata_id).then(({ data }) => {
              if (data) setHistory(prev => ({ ...prev, [vendaParaVincular.item_ata_id]: data }))
            })
          }
        }}
      />
    )}

    {/* Modal de Solicitação Manual de Compra (ATAs) */}
    <Dialog open={!!solicitarItem} onOpenChange={(open) => { if (!open) setSolicitarItem(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar Compra de Item da ARP</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para enviar a solicitação para o setor de compras.
          </DialogDescription>
        </DialogHeader>
        {solicitarItem && (
          <div className="space-y-4 my-4">
            <div>
              <Label className="text-xs font-bold text-zinc-500">Item</Label>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
                {solicitarItem.descricao}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-zinc-500">Unidade</Label>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {solicitarItem.unidade || 'UN'}
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-zinc-500">Valor Unitário</Label>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {solicitarItem.valor_unitario ? `R$ ${solicitarItem.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="qtd_solicitar_ata" className="text-xs font-bold text-zinc-500">
                Quantidade a Solicitar (Saldo Real: {solicitarItem.saldo_real})
              </Label>
              <Input
                id="qtd_solicitar_ata"
                type="number"
                min={1}
                max={solicitarItem.saldo_real}
                value={solicitarQtd}
                onChange={(e) => setSolicitarQtd(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="prazo_sla_ata" className="text-xs font-bold text-zinc-500">
                Prazo Limite / SLA (Entrega)
              </Label>
              <Input
                id="prazo_sla_ata"
                type="date"
                value={solicitarPrazo}
                onChange={(e) => setSolicitarPrazo(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="marca_solicitar_ata" className="text-xs font-bold text-zinc-500">
                Marca de Referência
              </Label>
              <Input
                id="marca_solicitar_ata"
                value={solicitarMarca}
                onChange={(e) => setSolicitarMarca(e.target.value)}
                placeholder="Fabricante ou marca desejada..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="obs_solicitar_ata" className="text-xs font-bold text-zinc-500">
                Observações
              </Label>
              <Textarea
                id="obs_solicitar_ata"
                value={solicitarObs}
                onChange={(e) => setSolicitarObs(e.target.value)}
                placeholder="Justificativa ou informações adicionais para o comprador"
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setSolicitarItem(null)} disabled={solicitarLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmSolicitar} disabled={solicitarLoading}>
            {solicitarLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirmar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function getAtaEffectiveSubcategory(ata: Ata): string | null {
  if (ata.subcategoria && ata.subcategoria.trim()) return ata.subcategoria.trim()
  if (!ata.itens || ata.itens.length === 0) return null

  const counts: Record<string, number> = {}
  ata.itens.forEach(it => {
    let sub = (it.subcategoria || '').trim()
    if (!sub && it.descricao) {
      const upper = it.descricao.toUpperCase()
      if (upper.includes('FRALDA')) sub = 'Fraldas & Higiene'
      else if (upper.includes('LUVA')) sub = 'Luvas & EPIs'
      else if (upper.includes('SERINGA') || upper.includes('AGULHA')) sub = 'Agulhas & Seringas'
      else if (upper.includes('GAZE') || upper.includes('ATADURA') || upper.includes('CURATIVO')) sub = 'Curativos & Gaze'
      else if (upper.includes('EQUIPO') || upper.includes('CATETER')) sub = 'Equipos & Cateteres'
      else if (upper.includes('SOLUCAO') || upper.includes('SORO')) sub = 'Soluções Parenterais'
      else if (upper.includes('CADEIRA') || upper.includes('MESA') || upper.includes('LEITO')) sub = 'Mobiliário Hospitalar'
      else if (upper.includes('DETERGENTE') || upper.includes('SABAO') || upper.includes('ALCOOL')) sub = 'Higiene & Antissepsia'
    }
    if (sub) {
      counts[sub] = (counts[sub] || 0) + 1
    }
  })

  let best: string | null = null
  let max = 0
  Object.entries(counts).forEach(([sub, count]) => {
    if (count > max) {
      max = count
      best = sub
    }
  })
  return best
}

interface AtasProps {
  filterUf?: string
  filterCliente?: string
}

export function Atas({ filterUf, filterCliente }: AtasProps = {}) {
  const { profile, isSuperAdmin } = useAuth()
  const [atas, setAtas] = useState<Ata[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [itemSearchTerm, setItemSearchTerm] = useState('')
  const [matchingAtaIdsFromItemSearch, setMatchingAtaIdsFromItemSearch] = useState<Set<string> | null>(null)
  const [searchingItems, setSearchingItems] = useState(false)

  useEffect(() => {
    if (!itemSearchTerm.trim()) {
      setMatchingAtaIdsFromItemSearch(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearchingItems(true)
      try {
        const queryTerm = `%${itemSearchTerm.trim()}%`
        const { data } = await supabase
          .from('itens_ata')
          .select('ata_id')
          .or(`descricao.ilike.${queryTerm},marca.ilike.${queryTerm},codigo_item.ilike.${queryTerm},categoria.ilike.${queryTerm},subcategoria.ilike.${queryTerm}`)
        
        const matchedIds = new Set((data || []).map(i => i.ata_id))
        setMatchingAtaIdsFromItemSearch(matchedIds)
      } catch (err) {
        console.error('Erro na busca por item:', err)
      } finally {
        setSearchingItems(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [itemSearchTerm])

  const [deleteConfirmAta, setDeleteConfirmAta] = useState<Ata | null>(null)
  const [deleteHasConsumption, setDeleteHasConsumption] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itensAta, setItensAta] = useState<ItemAta[]>([])
  const [saldoFinanceiroMap, setSaldoFinanceiroMap] = useState<Record<string, number>>({})

  // ATA editing states
  const [entidades, setEntidades] = useState<any[]>([])
  const [editAta, setEditAta] = useState<Ata | null>(null)
  const [editNumeroArp, setEditNumeroArp] = useState('')
  const [editEntidadeId, setEditEntidadeId] = useState('')
  const [editDataAssinatura, setEditDataAssinatura] = useState('')
  const [editDataValidade, setEditDataValidade] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editAssignedTo, setEditAssignedTo] = useState('')

  // Estados locais para novos filtros
  const [localFilterResponsavel, setLocalFilterResponsavel] = useState('all')
  const [localFilterUf, setLocalFilterUf] = useState('all')
  const [localFilterObjeto, setLocalFilterObjeto] = useState('all')
  const [localFilterStatus, setLocalFilterStatus] = useState('all')
  const [localFilterSubcategoria, setLocalFilterSubcategoria] = useState('all')
  const [responsaveis, setResponsaveis] = useState<{ id: string; display_name: string | null }[]>([])

  // Estados para geração de relatórios de ATAs
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportType, setReportType] = useState<'detalhado' | 'usuario' | 'estado' | 'consolidado'>('consolidado')
  const [reportFormat, setReportFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    async function loadEntidades() {
      try {
        const { data } = await supabase.from('entidades').select('id, nome').order('nome')
        if (data) setEntidades(data)
      } catch (err) {
        console.error('Erro ao carregar entidades:', err)
      }
    }
    loadEntidades()
  }, [])

  useEffect(() => {
    async function loadResponsaveis() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name')
          .order('display_name')
        if (data) {
          setResponsaveis(data.filter(p => p.display_name))
        }
      } catch (err) {
        console.error('Erro ao carregar responsaveis:', err)
      }
    }
    loadResponsaveis()
  }, [])

  const handleOpenEdit = (ata: Ata) => {
    setEditAta(ata)
    setEditNumeroArp(ata.numero_arp)
    setEditEntidadeId(ata.entidade_id ? String(ata.entidade_id) : '')
    setEditDataAssinatura(ata.data_assinatura ? ata.data_assinatura.split('T')[0] : '')
    setEditDataValidade(ata.data_validade ? ata.data_validade.split('T')[0] : '')
    setEditAssignedTo(ata.assigned_to || 'none')
  }

  const handleSaveEdit = async () => {
    if (!editAta) return
    if (!editNumeroArp.trim()) {
      toast.error('O número da ARP é obrigatório.')
      return
    }
    if (!editEntidadeId) {
      toast.error('Selecione o Cliente / Órgão Gerenciador.')
      return
    }

    setEditLoading(true)
    try {
      const selectedEntity = entidades.find(e => String(e.id) === editEntidadeId)
      const selectedEntityName = selectedEntity ? selectedEntity.nome : editAta.entidade_gerenciadora

      const { error } = await (supabase
        .from('atas') as any)
        .update({
          numero_arp: editNumeroArp.trim(),
          entidade_id: editEntidadeId || null,
          entidade_gerenciadora: selectedEntityName,
          data_assinatura: editDataAssinatura || null,
          data_validade: editDataValidade || null,
          assigned_to: editAssignedTo === 'none' ? null : editAssignedTo
        })
        .eq('id', editAta.id)

      if (error) throw error

      await logAction('EDITAR_ATA', 'atas', editAta.id, {
        numero_arp: editNumeroArp.trim(),
        entidade_gerenciadora: selectedEntityName
      })

      toast.success('Cadastro da ATA atualizado com sucesso!')
      setEditAta(null)
      fetchAtas()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar edições: ' + err.message)
    } finally {
      setEditLoading(false)
    }
  }

  const handleQuickAssign = async (ataId: string, gestorId: string) => {
    try {
      const newAssign = gestorId === 'none' ? null : gestorId
      const { error } = await (supabase.from('atas') as any)
        .update({ assigned_to: newAssign })
        .eq('id', ataId)
      if (error) throw error
      toast.success('Gestor responsável atualizado!')
      fetchAtas()
    } catch (err: any) {
      toast.error('Erro ao atribuir gestor: ' + err.message)
    }
  }

  // Gera relatório em formato Excel (.xlsx)
  const generateExcelReport = () => {
    const wb = XLSX.utils.book_new()
    const fileName = `relatorio_licitacoes_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`

    if (reportType === 'consolidado') {
      const excelData = filteredAtas.map((a, idx) => {
        const global = a.valor_global || 0
        const saldoFin = saldoFinanceiroMap[a.id] || 0
        const consumido = global - saldoFin
        const dataVal = a.data_validade ? new Date(a.data_validade) : null
        let diasStr = 'SEM DATA'
        if (dataVal) {
          const hoje = new Date()
          hoje.setHours(0, 0, 0, 0)
          dataVal.setHours(0, 0, 0, 0)
          const diffDays = Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
          diasStr = diffDays < 0 ? `VENCIDA HÁ ${Math.abs(diffDays)} DIAS` : `FALTAM ${diffDays} DIAS`
        }

        return {
          'N°': idx + 1,
          'MUNICÍPIO / ORGÃO': a.entidade_gerenciadora || '',
          'Nº DA ATA': a.numero_arp,
          'DATA DE ASSINATURA': a.data_assinatura ? new Date(a.data_assinatura).toLocaleDateString('pt-BR') : '—',
          'VIGENCIA DE ATA': a.data_validade ? new Date(a.data_validade).toLocaleDateString('pt-BR') : '—',
          'DIAS PARA VENCER': diasStr,
          'VALOR DA ATA (R$)': global,
          'VALOR CONSUMIDO (R$)': consumido,
          'SALDO RESTANTE (R$)': saldoFin,
          'OBJETO DA ATA': a.objeto_ata || '—',
          'GESTOR RESPONSÁVEL': a.assigned_user?.display_name || 'Sem Gestor'
        }
      })

      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, 'Consolidado de Licitações')

    } else if (reportType === 'estado') {
      const groups: Record<string, { uf: string; count: number; valorGlobal: number; saldoRestante: number }> = {}
      filteredAtas.forEach(a => {
        const ufKey = a.uf || 'SEM UF'
        if (!groups[ufKey]) {
          groups[ufKey] = { uf: ufKey, count: 0, valorGlobal: 0, saldoRestante: 0 }
        }
        groups[ufKey].count += 1
        groups[ufKey].valorGlobal += a.valor_global || 0
        groups[ufKey].saldoRestante += saldoFinanceiroMap[a.id] || 0
      })

      const excelData = Object.values(groups).map(g => ({
        'Estado / UF': g.uf,
        'Qtd de ATAs': g.count,
        'Valor Global (R$)': g.valorGlobal,
        'Saldo Restante (R$)': g.saldoRestante,
        'Valor Consumido (R$)': g.valorGlobal - g.saldoRestante,
        '% Consumido': g.valorGlobal > 0 ? parseFloat(((g.valorGlobal - g.saldoRestante) / g.valorGlobal * 100).toFixed(2)) : 0
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, 'Por Estado')

    } else if (reportType === 'usuario') {
      const groups: Record<string, { name: string; count: number; valorGlobal: number; saldoRestante: number }> = {}
      filteredAtas.forEach(a => {
        const respKey = a.assigned_user?.display_name || 'SEM RESPONSÁVEL'
        if (!groups[respKey]) {
          groups[respKey] = { name: respKey, count: 0, valorGlobal: 0, saldoRestante: 0 }
        }
        groups[respKey].count += 1
        groups[respKey].valorGlobal += a.valor_global || 0
        groups[respKey].saldoRestante += saldoFinanceiroMap[a.id] || 0
      })

      const excelData = Object.values(groups).map(g => ({
        Responsavel: g.name,
        'Qtd de ATAs': g.count,
        'Valor Global (R$)': g.valorGlobal,
        'Saldo Restante (R$)': g.saldoRestante,
        'Valor Consumido (R$)': g.valorGlobal - g.saldoRestante,
        '% Consumido': g.valorGlobal > 0 ? parseFloat(((g.valorGlobal - g.saldoRestante) / g.valorGlobal * 100).toFixed(2)) : 0
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, 'Por Responsavel')

    } else if (reportType === 'detalhado') {
      const excelData = filteredAtas.map(a => ({
        'Numero ARP': a.numero_arp,
        UF: a.uf || '',
        'Orgao Gerenciador': a.entidade_gerenciadora || '',
        Objeto: a.objeto_ata || '',
        Responsavel: a.assigned_user?.display_name || 'Sem Responsavel',
        'Valor Global (R$)': a.valor_global || 0,
        'Saldo Restante (R$)': saldoFinanceiroMap[a.id] || 0,
        Validade: a.data_validade ? new Date(a.data_validade).toLocaleDateString('pt-BR') : ''
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, 'Detalhamento de ATAs')
    }

    XLSX.writeFile(wb, fileName)
    toast.success('Relatório Excel de ATAs gerado com sucesso!')
    setShowReportModal(false)
  }

  // Gera relatório em formato PDF (.pdf)
  const generatePdfReport = () => {
    const doc = new jsPDF({ orientation: reportType === 'detalhado' ? 'landscape' : 'portrait' })
    const dateStr = new Date().toLocaleDateString('pt-BR')

    doc.setFontSize(16)
    doc.setTextColor(24, 24, 27)
    doc.text('Relatorio de Atas de Registro de Precos - ARP', 14, 20)
    doc.setFontSize(10)
    doc.setTextColor(113, 113, 122)
    doc.text(`Gerado em: ${dateStr} | Total de ATAs Filtro: ${filteredAtas.length}`, 14, 26)
    
    doc.setDrawColor(228, 228, 231)
    const lineRight = reportType === 'detalhado' ? 283 : 196
    doc.line(14, 30, lineRight, 30)

    const formatCurrencyBRL = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    }

    if (reportType === 'consolidado') {
      doc.setFontSize(12)
      doc.setTextColor(24, 24, 27)
      doc.text('Resumo Geral Financeiro', 14, 38)

      const totalGlobal = filteredAtas.reduce((acc, a) => acc + (a.valor_global || 0), 0)
      const totalSaldo = filteredAtas.reduce((acc, a) => acc + (saldoFinanceiroMap[a.id] || 0), 0)
      const totalConsumido = totalGlobal - totalSaldo
      const pctConsumido = totalGlobal > 0 ? ((totalGlobal - totalSaldo) / totalGlobal * 100).toFixed(1) : '0'

      autoTable(doc, {
        startY: 42,
        head: [['Metrica ARP', 'Valor']],
        body: [
          ['Total de ATAs Vigentes no Filtro', String(filteredAtas.length)],
          ['Valor Global Cadastrado (R$)', formatCurrencyBRL(totalGlobal)],
          ['Saldo Financeiro Restante (R$)', formatCurrencyBRL(totalSaldo)],
          ['Valor Consumido (R$)', formatCurrencyBRL(totalConsumido)],
          ['Taxa de Consumo Medio (%)', `${pctConsumido}%`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'estado') {
      doc.setFontSize(12)
      doc.text('Distribuicao e Saldo de ATAs por Estado / UF', 14, 38)

      const groups: Record<string, { uf: string; count: number; valorGlobal: number; saldoRestante: number }> = {}
      filteredAtas.forEach(a => {
        const ufKey = a.uf || 'SEM UF'
        if (!groups[ufKey]) {
          groups[ufKey] = { uf: ufKey, count: 0, valorGlobal: 0, saldoRestante: 0 }
        }
        groups[ufKey].count += 1
        groups[ufKey].valorGlobal += a.valor_global || 0
        groups[ufKey].saldoRestante += saldoFinanceiroMap[a.id] || 0
      })

      const rows = Object.values(groups).map(g => [
        g.uf,
        String(g.count),
        formatCurrencyBRL(g.valorGlobal),
        formatCurrencyBRL(g.saldoRestante),
        g.valorGlobal > 0 ? `${((g.valorGlobal - g.saldoRestante) / g.valorGlobal * 100).toFixed(1)}%` : '0%'
      ])

      autoTable(doc, {
        startY: 42,
        head: [['Estado / UF', 'Qtd ATAs', 'Valor Global', 'Saldo Restante', '% Consumido']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'usuario') {
      doc.setFontSize(12)
      doc.text('Distribuicao e Saldo de ATAs por Responsavel', 14, 38)

      const groups: Record<string, { name: string; count: number; valorGlobal: number; saldoRestante: number }> = {}
      filteredAtas.forEach(a => {
        const respKey = a.assigned_user?.display_name || 'SEM RESPONSÁVEL'
        if (!groups[respKey]) {
          groups[respKey] = { name: respKey, count: 0, valorGlobal: 0, saldoRestante: 0 }
        }
        groups[respKey].count += 1
        groups[respKey].valorGlobal += a.valor_global || 0
        groups[respKey].saldoRestante += saldoFinanceiroMap[a.id] || 0
      })

      const rows = Object.values(groups).map(g => [
        g.name,
        String(g.count),
        formatCurrencyBRL(g.valorGlobal),
        formatCurrencyBRL(g.saldoRestante),
        g.valorGlobal > 0 ? `${((g.valorGlobal - g.saldoRestante) / g.valorGlobal * 100).toFixed(1)}%` : '0%'
      ])

      autoTable(doc, {
        startY: 42,
        head: [['Responsavel', 'Qtd ATAs', 'Valor Global', 'Saldo Restante', '% Consumido']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'detalhado') {
      doc.setFontSize(11)
      doc.text('Listagem Detalhada de Atas de Registro de Preços', 14, 38)

      const rows = filteredAtas.map(a => [
        a.numero_arp,
        a.uf || '',
        a.entidade_gerenciadora || '',
        a.objeto_ata || '',
        a.assigned_user?.display_name || 'Sem Responsável',
        formatCurrencyBRL(a.valor_global || 0),
        formatCurrencyBRL(saldoFinanceiroMap[a.id] || 0),
        a.data_validade ? new Date(a.data_validade).toLocaleDateString('pt-BR') : '—'
      ])

      autoTable(doc, {
        startY: 42,
        head: [['Número ARP', 'UF', 'Órgão Gerenciador (Município)', 'Objeto', 'Responsável', 'Valor Global', 'Saldo Restante', 'Validade']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          2: { cellWidth: 70 }, // Dá mais espaço para a coluna do Órgão Gerenciador (Município)
        }
      })
    }

    doc.save(`relatorio_atas_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`)
    toast.success('Relatório PDF de ATAs gerado com sucesso!')
    setShowReportModal(false)
  }

  // Handler para cálculo assíncrono de saldos e exportação do relatório
  const handleTriggerReportGeneration = async () => {
    if (filteredAtas.length === 0) {
      toast.warning('Nenhuma ATA disponível no filtro para gerar relatório.')
      return
    }

    setGeneratingReport(true)
    try {
      const atasToFetch = filteredAtas.filter(a => saldoFinanceiroMap[a.id] === undefined)
      if (atasToFetch.length > 0) {
        const batchSize = 10
        for (let i = 0; i < atasToFetch.length; i += batchSize) {
          const batch = atasToFetch.slice(i, i + batchSize)
          await Promise.all(batch.map(async (ata) => {
            const data = await fetchSaldoAta(ata.id)
            const saldoFin = (data as any[]).reduce((acc, item) => {
              return acc + ((item.saldo_real || 0) * (item.valor_unitario || 0))
            }, 0)
            setSaldoFinanceiroMap(prev => ({ ...prev, [ata.id]: saldoFin }))
            saldoFinanceiroMap[ata.id] = saldoFin
          }))
        }
      }

      if (reportFormat === 'xlsx') {
        generateExcelReport()
      } else {
        generatePdfReport()
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao calcular saldos das ATAs: ' + err.message)
    } finally {
      setGeneratingReport(false)
    }
  }

  async function refreshItensAta(ataId: string) {
    try {
        const data = await fetchSaldoAta(ataId)
        setItensAta(data as unknown as ItemAta[])
        const saldoFin = (data as any[]).reduce((acc, item) => {
          return acc + ((item.saldo_real || 0) * (item.valor_unitario || 0))
        }, 0)
        setSaldoFinanceiroMap(prev => ({ ...prev, [ataId]: saldoFin }))
    } catch (error) {
        console.error('Erro ao atualizar itens da Ata:', error)
    }
  }

  useEffect(() => {
    if (profile?.id) {
      fetchAtas()
    }
  }, [profile?.id])

  async function fetchAtas() {
    setLoading(true)
    try {
      // Buscar IDs de perfis do Hiago Martins para aplicação de regra de privacidade estrita
      const { data: hiagoProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or('display_name.ilike.%hiago%,email.ilike.%hiago%')

      const hiagoIds = (hiagoProfiles || []).map(p => p.id)
      const currentUserId = profile?.id
      const isDev = profile?.nivel === 'DEV'
      const isHiago = currentUserId ? hiagoIds.includes(currentUserId) : false

      let query = supabase
        .from('atas')
        .select('*, assigned_user:profiles(display_name)')
      
      // Aplicar isolamento para usuários OP (Dono ou Atribuído)
      const isOP = profile?.nivel === 'OP'
      if (isOP && currentUserId) {
        query = query.or(`owner_id.eq.${currentUserId},assigned_to.eq.${currentUserId}`)
      }

      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error

      let rawList = (data as unknown as Ata[]) || []

      // Regra de Privacidade Estrita para Hiago Martins:
      // Apenas o próprio Hiago Martins e o desenvolvedor (DEV) podem ver as ATAs importadas pelo Hiago.
      if (!isDev && !isHiago && hiagoIds.length > 0) {
        rawList = rawList.filter(ata => {
          const ownerIsHiago = ata.owner_id ? hiagoIds.includes(ata.owner_id) : false
          return !ownerIsHiago
        })
      }

      setAtas(rawList)
    } catch (err) {
      toast.error('Erro ao buscar atas')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleExpand(ata: Ata) {
    if (expandedId === ata.id) {
        setExpandedId(null)
        setItensAta([])
        return
    }
    
    setExpandedId(ata.id)
    setLoading(true)
    try {
        const data = await fetchSaldoAta(ata.id)
        setItensAta(data as unknown as ItemAta[])
        // Calcula e armazena o saldo financeiro desta ATA
        const saldoFin = (data as any[]).reduce((acc, item) => {
          return acc + ((item.saldo_real || 0) * (item.valor_unitario || 0))
        }, 0)
        setSaldoFinanceiroMap(prev => ({ ...prev, [ata.id]: saldoFin }))
    } catch (error) {
        toast.error('Erro ao buscar itens da Ata')
    } finally {
        setLoading(false)
    }
  }

  async function deleteDocument(filePath: string) {
    const { error } = await supabase.storage
      .from('documentos')
      .remove([filePath])
    if (error) console.warn('Erro ao deletar arquivo do storage:', error)
  }

  async function handleOpenDelete(ata: Ata) {
    setLoading(true)
    try {
      const consumption = await checkAtaConsumption(ata.id)
      setDeleteHasConsumption(consumption)
      setDeleteConfirmAta(ata)
    } catch (err) {
      toast.error('Erro ao verificar dependências da Ata')
    } finally {
      setLoading(false)
    }
  }

  async function deleteAta() {
    if (!deleteConfirmAta) return
    const id = deleteConfirmAta.id
    const numero_arp = deleteConfirmAta.numero_arp

    setLoading(true)
    try {
      const { data: ata } = await supabase.from('atas').select('arquivo_caminho').eq('id', id).single()
      
      if (ata?.arquivo_caminho) {
        try {
          await deleteDocument(ata.arquivo_caminho.replace('documentos/', ''))
        } catch (err) {
          console.warn('Arquivo da ata não encontrado no storage, prosseguindo...', err)
        }
      }

      const { error: errNotas } = await supabase.from('notas').update({ ata_id: null }).eq('ata_id', id)
      if (errNotas) console.warn('Erro ao desvincular notas:', errNotas)
      
      const { data: itensAtaIds } = await supabase.from('itens_ata').select('id').eq('ata_id', id)
      if (itensAtaIds && itensAtaIds.length > 0) {
          const ids = itensAtaIds.map(i => i.id)

          // 1. Deletar histórico de entregas vinculado — a constraint check_origem_venda
          //    impede SET NULL, então é necessário remover esses registros junto com a ATA
          const { error: errHistorico } = await supabase
            .from('historico_entregas')
            .delete()
            .in('item_ata_id', ids)
          if (errHistorico) console.warn('Erro ao remover histórico de entregas:', errHistorico)

          // 2. Desvincular itens de consumo (tabela itens)
          const { error: errItensLink } = await supabase.from('itens').update({ item_ata_id: null }).in('item_ata_id', ids)
          if (errItensLink) console.warn('Erro ao desvincular itens de consumo:', errItensLink)
      }

      const { error: errItens } = await supabase.from('itens_ata').delete().eq('ata_id', id)
      if (errItens) throw errItens

      const { error: errAta } = await supabase.from('atas').delete().eq('id', id)
      if (errAta) throw errAta

      await logAction('EXCLUIR_ATA', 'atas', id, { numero_arp })

      toast.success('Ata e itens removidos com sucesso!')
      fetchAtas()
    } catch (err: any) {
      console.error('Erro detalhado ao excluir:', err)
      const message = err?.message || (typeof err === 'string' ? err : 'Erro desconhecido de banco de dados (409/Conflict)')
      toast.error('Erro ao excluir ata: ' + message)
    } finally {
      setLoading(false)
      setDeleteConfirmAta(null)
    }
  }

  const filteredAtas = atas.filter(a => {
    // 0. Busca por Item da Ata (descrição, código, marca, subcategoria)
    if (matchingAtaIdsFromItemSearch !== null) {
      if (!matchingAtaIdsFromItemSearch.has(a.id)) return false
    }

    // 1. Termo de busca (número ARP ou Órgão Gerenciador)
    const matchesSearch = 
      a.numero_arp.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.entidade_gerenciadora?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false

    // 2. UF/Estado (pode vir por props de VendedorDashboard ou do filtro local)
    const ufToFilter = filterUf !== undefined ? filterUf : localFilterUf
    if (ufToFilter && ufToFilter !== 'all') {
      if (a.uf !== ufToFilter) return false
    }

    // 3. Cliente/Órgão Gerenciador (pode vir por props de VendedorDashboard)
    const clienteToFilter = filterCliente !== undefined ? filterCliente : ''
    if (clienteToFilter && clienteToFilter.trim() !== '') {
      const cleanCliente = clienteToFilter.toLowerCase().trim()
      const matchesCliente = (a.entidade_gerenciadora?.toLowerCase() || '').includes(cleanCliente)
      if (!matchesCliente) return false
    }

    // 4. Responsável
    if (localFilterResponsavel && localFilterResponsavel !== 'all') {
      if (a.assigned_to !== localFilterResponsavel) return false
    }

    // 5. Objeto (e.g. Medicamento, Material Hospitalar)
    if (localFilterObjeto && localFilterObjeto !== 'all') {
      if (a.objeto_ata !== localFilterObjeto) return false
    }

    // 6. Status / Validade / Saldo
    if (localFilterStatus && localFilterStatus !== 'all') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const dataValidade = a.data_validade ? new Date(a.data_validade) : null
      if (dataValidade) {
        dataValidade.setHours(0, 0, 0, 0)
      }
      const diffMs = dataValidade ? dataValidade.getTime() - hoje.getTime() : -999999999
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const saldoLivre = saldoFinanceiroMap[a.id] !== undefined ? saldoFinanceiroMap[a.id] : (a.valor_global || 0)

      if (localFilterStatus === 'vigente') {
        if (!dataValidade || diffDays <= 60) return false
      } else if (localFilterStatus === 'a_vencer') {
        if (!dataValidade || diffDays <= 0 || diffDays > 60) return false
      } else if (localFilterStatus === 'critico') {
        if (!dataValidade || diffDays <= 0 || diffDays > 30) return false
      } else if (localFilterStatus === 'vencida') {
        if (dataValidade && diffDays > 0) return false
      } else if (localFilterStatus === 'com_saldo') {
        if (saldoLivre <= 0) return false
      } else if (localFilterStatus === 'esgotada') {
        if (saldoLivre > 0) return false
      }
    }

    // 7. Subcategoria (se filtrada)
    if (localFilterSubcategoria && localFilterSubcategoria !== 'all') {
      const subcatUpper = localFilterSubcategoria.toUpperCase()
      const effSubcat = getAtaEffectiveSubcategory(a)
      const matchesAtaSubcat = effSubcat ? effSubcat.toUpperCase() === subcatUpper : false
      const temSubcat = (a.itens || []).some((it: any) => (it.subcategoria || '').toUpperCase() === subcatUpper)
      if (!matchesAtaSubcat && !temSubcat) return false
    }

    return true
  })

  const kpiStats = useMemo(() => {
    const totalCount = filteredAtas.length
    let valorGlobalTotal = 0
    let saldoTotal = 0
    let alertasVigenciaCount = 0
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    filteredAtas.forEach(a => {
      valorGlobalTotal += (a.valor_global || 0)
      saldoTotal += (saldoFinanceiroMap[a.id] || 0)

      if (a.data_validade) {
        const valDate = new Date(a.data_validade)
        valDate.setHours(0, 0, 0, 0)
        const diffDays = Math.ceil((valDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays <= 60) {
          alertasVigenciaCount++
        }
      }
    })

    return {
      totalCount,
      valorGlobalTotal,
      saldoTotal,
      valorConsumidoTotal: valorGlobalTotal - saldoTotal,
      alertasVigenciaCount
    }
  }, [filteredAtas, saldoFinanceiroMap])

  const getVigenciaBadge = (dataValidadeStr: string | null) => {
    if (!dataValidadeStr) return <Badge variant="outline" className="text-zinc-400 text-[10px]">Sem Data</Badge>
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const valDate = new Date(dataValidadeStr)
    valDate.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((valDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 font-bold text-[10px]">VENCIDA ({Math.abs(diffDays)}d)</Badge>
    } else if (diffDays <= 30) {
      return <Badge className="bg-red-50 text-red-600 border-red-200 font-bold text-[10px]">FALTAM {diffDays} DIAS</Badge>
    } else if (diffDays <= 60) {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-bold text-[10px]">FALTAM {diffDays} DIAS</Badge>
    } else {
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[10px]">FALTAM {diffDays} DIAS</Badge>
    }
  }

  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, itemSearchTerm, localFilterResponsavel, localFilterUf, localFilterObjeto, localFilterStatus, localFilterSubcategoria, filterUf, filterCliente])

  const paginatedAtas = useMemo(() => {
    return filteredAtas.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  }, [filteredAtas, currentPage])

  const totalPages = Math.ceil(filteredAtas.length / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-accent" />
            Portal de Licitações
          </h1>
          <p className="text-zinc-500 text-xs tracking-tight">Gestão centralizada de Atas de Registro de Preços, vigência, saldo e atribuição de gestores</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowReportModal(true)}
            className="h-9 gap-2 text-xs font-bold uppercase bg-brand-accent hover:opacity-90 text-white shadow shadow-brand-accent/10 cursor-pointer"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            Relatórios Oficiais
          </Button>
        </div>
      </div>

      {/* KPI Cards do Portal de Licitações */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">ATAs sob Gestão</p>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1">{kpiStats.totalCount}</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Atas ativas no portal</p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
              <Building2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Valor Global Registrado</p>
              <h3 className="text-xl font-black text-brand-accent mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpiStats.valorGlobalTotal)}
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Teto homologado em licitações</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Saldo Disponível Restante</p>
              <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpiStats.saldoTotal)}
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Disponível para novos empenhos</p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-900/30">
              <PieChart className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Alertas de Vigência</p>
              <h3 className={`text-2xl font-black mt-1 ${kpiStats.alertasVigenciaCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {kpiStats.alertasVigenciaCount}
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Vencem em menos de 60 dias ou vencidas</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
                {/* Busca por ARP / Órgão */}
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <Input
                    placeholder="Buscar por número ARP, Órgão..."
                    className="h-8 border-none shadow-none focus-visible:ring-0 bg-transparent text-xs p-0 w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400" onClick={() => setSearchTerm('')}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Busca por Item de Ata */}
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 flex-1 min-w-[240px]">
                  <Package className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <Input
                    placeholder="Buscar por Item, Marca, Subcategoria..."
                    className="h-8 border-none shadow-none focus-visible:ring-0 bg-transparent text-xs p-0 w-full"
                    value={itemSearchTerm}
                    onChange={(e) => setItemSearchTerm(e.target.value)}
                  />
                  {searchingItems ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500 flex-shrink-0" />
                  ) : itemSearchTerm ? (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400" onClick={() => setItemSearchTerm('')}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <Badge variant="outline" className="text-[10px] font-mono tracking-widest self-start sm:self-center">
                {filteredAtas.length} ARPS LOCALIZADAS
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro: Responsável */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Gestor Responsável</span>
                <Select value={localFilterResponsavel} onValueChange={setLocalFilterResponsavel}>
                  <SelectTrigger className="h-8 w-44 text-xs bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {responsaveis.map(resp => (
                      <SelectItem key={resp.id} value={resp.id}>
                        {resp.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro: UF (só renderiza se não vier por prop) */}
              {filterUf === undefined && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Estado / UF</span>
                  <Select value={localFilterUf} onValueChange={setLocalFilterUf}>
                    <SelectTrigger className="h-8 w-28 text-xs bg-white dark:bg-zinc-950">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Filtro: Objeto */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Objeto</span>
                <Select value={localFilterObjeto} onValueChange={setLocalFilterObjeto}>
                  <SelectTrigger className="h-8 w-40 text-xs bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {['Medicamento', 'Material Hospitalar', 'Odonto', 'Mobiliário', 'Eletrônico', 'Misto'].map(obj => (
                      <SelectItem key={obj} value={obj}>{obj}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro: Status & Validade */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status & Validade</span>
                <Select value={localFilterStatus} onValueChange={setLocalFilterStatus}>
                  <SelectTrigger className="h-8 min-w-[200px] text-xs bg-white dark:bg-zinc-950 border-purple-200/50 dark:border-purple-900/50 font-medium">
                    <SelectValue placeholder="Todos os Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="vigente">🟢 Vigente (&gt; 60 dias)</SelectItem>
                    <SelectItem value="a_vencer">🟡 A Vencer (&le; 60 dias)</SelectItem>
                    <SelectItem value="critico">🟠 Crítico (&le; 30 dias)</SelectItem>
                    <SelectItem value="vencida">🔴 Vencida (Expirada)</SelectItem>
                    <SelectItem value="com_saldo">🟣 Com Saldo Livre</SelectItem>
                    <SelectItem value="esgotada">⚫ Saldo Esgotado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro: Subcategoria */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Subcategoria</span>
                <Select value={localFilterSubcategoria} onValueChange={setLocalFilterSubcategoria}>
                  <SelectTrigger className="h-8 min-w-[170px] text-xs bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Todas as Subcategorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Subcategorias</SelectItem>
                    {SUBCATEGORIAS_OPCOES.map(sub => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Botão de Limpar Filtros se algum filtro estiver ativo */}
              {(searchTerm || itemSearchTerm || localFilterResponsavel !== 'all' || localFilterUf !== 'all' || localFilterObjeto !== 'all' || localFilterStatus !== 'all' || localFilterSubcategoria !== 'all') && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSearchTerm('')
                    setItemSearchTerm('')
                    setLocalFilterResponsavel('all')
                    setLocalFilterUf('all')
                    setLocalFilterObjeto('all')
                    setLocalFilterStatus('all')
                    setLocalFilterSubcategoria('all')
                  }}
                  className="h-8 px-2 text-xs text-red-500 hover:text-red-600 self-end font-semibold gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Limpar Filtros
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <Table>
          <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/30">
            <TableRow>
               <TableHead className="w-[150px]">Número ARP</TableHead>
               <TableHead className="w-[50px]">UF</TableHead>
               <TableHead>Órgão Gerenciador</TableHead>
               <TableHead>Objeto</TableHead>
               <TableHead>Vigência</TableHead>
               <TableHead>Dias p/ Vencer</TableHead>
               <TableHead>Gestor Responsável</TableHead>
               <TableHead>Valor Global / Saldo</TableHead>
               <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && atas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center text-zinc-400">
                  Consultando base de registros de preços...
                </TableCell>
              </TableRow>
            ) : paginatedAtas.map((ata) => (
              <React.Fragment key={ata.id}>
                <TableRow 
                  className={`cursor-pointer transition-colors ${expandedId === ata.id ? 'bg-zinc-50 dark:bg-zinc-900 border-l-2 border-brand-accent' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`} 
                  onClick={() => handleToggleExpand(ata)}
                >
                   <TableCell className="font-bold text-zinc-900 dark:text-zinc-100 tracking-tighter">
                     <div className="flex flex-col gap-0.5">
                       <div className="flex items-center gap-2">
                         <Package className={`w-4 h-4 text-zinc-400 transition-transform ${expandedId === ata.id ? 'rotate-180 text-brand-accent' : ''}`} />
                         <span>{ata.numero_arp}</span>
                       </div>
                       {/* Badges de Tipo de Documento e Adesão / Aditivo */}
                       <div className="flex flex-wrap items-center gap-1">
                         {ata.tipo_documento === 'CONTRATO' && (
                           <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300">
                             CONTRATO
                           </span>
                         )}
                         {ata.tipo_documento === 'ADESAO' && (
                           <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300">
                             🤝 ADESÃO (CARONA)
                           </span>
                         )}
                         {ata.tipo_documento === 'ADITIVO' && (
                           <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300">
                             📝 ADITIVO
                           </span>
                         )}
                         {ata.parent_ata_id && (
                           <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 font-semibold" title="Vinculado à Ata Mãe">
                             (Vinc. Ata Mãe)
                           </span>
                         )}
                       </div>
                     </div>
                   </TableCell>
                   <TableCell>
                      <Badge variant="outline" className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800">{ata.uf || '-'}</Badge>
                   </TableCell>
                   <TableCell className="max-w-xs truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                     {ata.entidade_gerenciadora || '-'}
                   </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {ata.objeto_ata ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${OBJETO_ATA_COLORS[ata.objeto_ata] || 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                            {ata.objeto_ata}
                          </span>
                        ) : <span className="text-zinc-300 text-xs">—</span>}

                        {/* Subcategoria da ATA (Item/Grupo mais frequente) */}
                        {(() => {
                          const effSub = getAtaEffectiveSubcategory(ata)
                          if (!effSub && !ata.subcategoria) return null
                          const currentSub = ata.subcategoria || effSub
                          return (
                            <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                              <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800 font-bold">
                                {currentSub}
                              </Badge>
                            </div>
                          )
                        })()}
                      </div>
                    </TableCell>
                   <TableCell>
                     <div className="flex items-center gap-1.5">
                       <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                       <span className={`text-xs font-bold ${ata.data_validade && new Date(ata.data_validade) < new Date() ? 'text-red-500' : 'text-zinc-600'}`}>
                         {ata.data_validade ? new Date(ata.data_validade).toLocaleDateString('pt-BR') : '-'}
                       </span>
                     </div>
                   </TableCell>
                   <TableCell>
                     {getVigenciaBadge(ata.data_validade)}
                   </TableCell>
                   <TableCell onClick={(e) => e.stopPropagation()}>
                     <Select 
                       value={ata.assigned_to || 'none'} 
                       onValueChange={(val) => handleQuickAssign(ata.id, val)}
                     >
                       <SelectTrigger className="h-7 text-[11px] bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 w-[150px]">
                         <SelectValue placeholder="Atribuir gestor..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="none" className="text-[11px] text-zinc-400">Sem Gestor</SelectItem>
                         {responsaveis.map(resp => (
                           <SelectItem key={resp.id} value={resp.id} className="text-[11px]">
                             {resp.display_name}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </TableCell>
                  <TableCell className="font-bold text-zinc-700 dark:text-zinc-300">
                    {(() => {
                      const global = ata.valor_global || 0
                      const saldoFin = saldoFinanceiroMap[ata.id]
                      const hasSaldo = saldoFin !== undefined
                      const pctSaldo = hasSaldo && global > 0 ? (saldoFin / global) * 100 : 100
                      const saldoColor = !hasSaldo ? 'text-zinc-400' :
                        pctSaldo <= 5 ? 'text-red-600' :
                        pctSaldo <= 20 ? 'text-amber-600' : 'text-emerald-600'
                      const barColor = !hasSaldo ? 'bg-zinc-200' :
                        pctSaldo <= 5 ? 'bg-red-500' :
                        pctSaldo <= 20 ? 'bg-amber-500' : 'bg-emerald-500'
                      return (
                        <div className="flex flex-col gap-1 min-w-[130px]">
                          <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(global)}
                          </span>
                          {hasSaldo ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold ${saldoColor}`}>
                                  Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoFin)}
                                </span>
                              </div>
                              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pctSaldo)}%` }} />
                              </div>
                            </>
                          ) : (
                            <span className="text-[9px] text-zinc-400">Expanda para ver saldo</span>
                          )}
                        </div>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {ata.arquivo_caminho && (
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                          <a href={getCleanPublicUrl(ata.arquivo_caminho)} target="_blank" rel="noopener noreferrer">
                            <FileDown className="w-4 h-4 text-brand-accent" />
                          </a>
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-brand-accent"
                        title="Editar cadastro da ATA"
                        onClick={() => handleOpenEdit(ata)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      {canDeleteAta(profile, isSuperAdmin, ata) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-red-500"
                          onClick={() => handleOpenDelete(ata)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {expandedId === ata.id && (
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-300">
                    <TableCell colSpan={8} className="p-6">
                       <ItemDetalheTable itens={itensAta} loading={loading} onRefresh={() => refreshItensAta(ata.id)} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 gap-3">
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
              Exibindo {filteredAtas.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredAtas.length)} de {filteredAtas.length} atas
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
              <span className="text-xs font-bold px-2 text-zinc-700 dark:text-zinc-300">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 text-xs font-bold"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>

      <SecurityConfirmDialog
        isOpen={!!deleteConfirmAta}
        onClose={() => setDeleteConfirmAta(null)}
        onConfirm={deleteAta}
        title="Excluir Registro de Preços"
        description={
          deleteHasConsumption
            ? `ATENÇÃO: A ARP ${deleteConfirmAta?.numero_arp} já possui consumo registrado (entregas e baixas). Se você continuar, o histórico de entregas vinculado a esta Ata será permanentemente removido. Os Empenhos/NEs permanecerão no sistema desvinculados. Deseja prosseguir?`
            : `Tem certeza que deseja remover permanentemente a ARP ${deleteConfirmAta?.numero_arp}? Todos os itens e o arquivo vinculado serão perdidos.`
        }
        confirmationMode="word"
        requiredWord="deletar"
      />

      <Dialog open={!!editAta} onOpenChange={(open) => { if (!open) setEditAta(null) }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Pencil className="w-5 h-5 text-brand-accent" />
              Editar Cadastro da ATA
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              Altere os dados gerais do registro de preços nos campos abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit_numero" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Número ARP *</Label>
              <Input
                id="edit_numero"
                value={editNumeroArp}
                onChange={(e) => setEditNumeroArp(e.target.value)}
                placeholder="Ex: 01/2026"
                className="h-9 text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Cliente / Órgão Gerenciador *</Label>
              <Select value={editEntidadeId} onValueChange={setEditEntidadeId}>
                <SelectTrigger className="h-9 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Selecione o cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {entidades.map(e => (
                    <SelectItem key={e.id} value={String(e.id)} className="text-xs">
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Responsável / Atribuído a</Label>
              <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                <SelectTrigger className="h-9 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Selecione o responsável..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">Sem Responsável (Ninguém)</SelectItem>
                  {responsaveis.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.display_name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit_data_assinatura" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Data de Emissão</Label>
                <Input
                  id="edit_data_assinatura"
                  type="date"
                  value={editDataAssinatura}
                  onChange={(e) => setEditDataAssinatura(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_data_validade" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Validade</Label>
                <Input
                  id="edit_data_validade"
                  type="date"
                  value={editDataValidade}
                  onChange={(e) => setEditDataValidade(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditAta(null)}
              disabled={editLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-brand-accent hover:opacity-90 text-white"
              onClick={handleSaveEdit}
              disabled={editLoading}
            >
              {editLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 📊 ATA REPORT GENERATOR MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden">
            <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-900 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-brand-accent flex items-center gap-2 tracking-wider uppercase">
                  <FileText className="w-5 h-5 shrink-0 text-brand-accent" />
                  Relatórios de ATAs
                </CardTitle>
                <button 
                  onClick={() => setShowReportModal(false)}
                  className="text-zinc-400 hover:text-zinc-650 dark:hover:text-white transition-colors p-1 cursor-pointer"
                  disabled={generatingReport}
                >
                  <X size={18} />
                </button>
              </div>
              <CardDescription className="text-zinc-450 dark:text-zinc-550 text-[10px] mt-1 leading-relaxed">
                Emita relatórios consolidados ou específicos com base nas ATAs do filtro atual ({filteredAtas.length} itens).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 pb-6 space-y-4 text-xs">
              {/* Tipo de Relatório */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Tipo de Relatório</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value as any)}
                  className="w-full h-10 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-brand-accent rounded-lg px-3 text-xs outline-none focus:border-brand-accent transition-colors cursor-pointer font-semibold"
                  disabled={generatingReport}
                >
                  <option value="consolidado">Consolidado Geral (Valores & Saldos)</option>
                  <option value="usuario">Agrupado por Responsável / Usuário</option>
                  <option value="estado">Agrupado por Estado / UF</option>
                  <option value="detalhado">Listagem de ATAs (Órgão / Município / Saldo)</option>
                </select>
              </div>

              {/* Formato de Exportação */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Formato do Arquivo</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { format: 'xlsx', label: 'Planilha Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-emerald-500' },
                    { format: 'pdf', label: 'Documento PDF (.pdf)', icon: FileText, color: 'text-red-500' }
                  ].map(opt => {
                    const Icon = opt.icon
                    const isSelected = reportFormat === opt.format
                    return (
                      <div
                        key={opt.format}
                        onClick={() => !generatingReport && setReportFormat(opt.format as any)}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-zinc-50 dark:bg-zinc-900 border-brand-accent text-brand-accent font-bold shadow-sm'
                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-550 hover:border-zinc-350 dark:hover:border-zinc-700'
                        } ${generatingReport ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Icon className={`w-4 h-4 ${opt.color}`} />
                        <span className="text-[11px]">{opt.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleTriggerReportGeneration}
                disabled={generatingReport}
                className="w-full h-11 bg-brand-accent hover:opacity-90 disabled:opacity-75 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-brand-accent/10 active:scale-98 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {generatingReport ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Calculando saldos...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 shrink-0" />
                    Gerar e Baixar Relatório
                  </>
                )}
              </button>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}
