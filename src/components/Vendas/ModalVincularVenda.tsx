import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { 
  Link as LinkIcon, 
  Loader2, 
  Search,
  CheckCircle2,
  FileText
} from 'lucide-react'

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '../ui/select'

interface ModalVincularVendaProps {
  venda: any
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ModalVincularVenda({ venda, isOpen, onClose, onSuccess }: ModalVincularVendaProps) {
  const [loading, setLoading] = useState(false)
  const [empenhosDisponiveis, setEmpenhosDisponiveis] = useState<any[]>([])
  const [empenhoSelecionadoId, setEmpenhoSelecionadoId] = useState<string>('')
  const [itensEmpenho, setItensEmpenho] = useState<any[]>([])
  const [itemEmpenhoSelecionadoId, setItemEmpenhoSelecionadoId] = useState<string>('')

  // 1. Ao abrir, buscar empenhos que utilizam a mesma ATA do item vendido
  useEffect(() => {
    if (!isOpen || !venda) return
    
    async function fetchEmpenhos() {
        setLoading(true)
        try {
            // Busca notas que tenham itens vinculados a esta mesma item_ata_id
            const { data, error } = await supabase
                .from('notas')
                .select(`
                    id,
                    numero_ne,
                    emissor,
                    itens!inner(id, item_ata_id)
                `)
                .eq('itens.item_ata_id', venda.item_ata_id)
            
            if (error) throw error
            setEmpenhosDisponiveis(data || [])
        } catch (err: any) {
            toast.error('Erro ao buscar empenhos: ' + err.message)
        } finally {
            setLoading(false)
        }
    }
    fetchEmpenhos()
  }, [isOpen, venda])

  // 2. Ao selecionar um empenho, filtrar os itens dele que batem com o item_ata_id vendido
  useEffect(() => {
    if (!empenhoSelecionadoId) {
        setItensEmpenho([])
        return
    }
    const empenho = empenhosDisponiveis.find(e => String(e.id) === empenhoSelecionadoId)
    if (empenho) {
        // Filtrar apenas itens que coincidem com a ATA da venda
        const itensValidos = empenho.itens.filter((it: any) => it.item_ata_id === venda.item_ata_id)
        setItensEmpenho(itensValidos)
        if (itensValidos.length === 1) {
            setItemEmpenhoSelecionadoId(String(itensValidos[0].id))
        }
    }
  }, [empenhoSelecionadoId, empenhosDisponiveis, venda.item_ata_id])

  async function handleVincular() {
    if (!itemEmpenhoSelecionadoId) {
        toast.error('Selecione o item do empenho.')
        return
    }

    setLoading(true)
    try {
        // Vincular a venda ao item do empenho
        const { error } = await supabase
            .from('historico_entregas')
            .update({ 
                item_id: Number(itemEmpenhoSelecionadoId),
                venda_tipo: 'NORMAL', // Deixa de ser "pré-faturada" para ser normal
                motivo_pendencia: null // Limpa o motivo da pendência
            })
            .eq('id', venda.id)

        if (error) throw error

        toast.success('Venda vinculada ao empenho com sucesso!')
        onSuccess()
        onClose()
    } catch (err: any) {
        toast.error('Erro ao vincular: ' + err.message)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <LinkIcon className="w-5 h-5" />
            <DialogTitle>Vincular Venda ao Empenho</DialogTitle>
          </div>
          <DialogDescription>
            Associe esta venda direta (NF {venda.numero_nf}) ao empenho oficial recebido pelo município.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Item Vendido Antecipadamente</div>
                <div className="text-sm font-medium">{venda.item_ata?.descricao || 'Carregando...'}</div>
                <div className="text-xs text-amber-600 font-bold mt-1">Quantidade: {venda.quantidade_entregue}</div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-zinc-400" />
                        1. Selecionar Empenho (NE)
                    </Label>
                    <Select value={empenhoSelecionadoId} onValueChange={setEmpenhoSelecionadoId}>
                        <SelectTrigger>
                            <SelectValue placeholder={loading ? "Carregando empenhos..." : "Escolha o empenho..."} />
                        </SelectTrigger>
                        <SelectContent>
                            {empenhosDisponiveis.map(e => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                    NE {e.numero_ne} - {e.emissor}
                                </SelectItem>
                            ))}
                            {empenhosDisponiveis.length === 0 && !loading && (
                                <div className="p-2 text-xs text-zinc-500">Nenhum empenho encontrado para esta ATA.</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {empenhoSelecionadoId && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <Label className="flex items-center gap-2">
                            <Search className="w-4 h-4 text-zinc-400" />
                            2. Confirmar Item do Empenho
                        </Label>
                        <Select value={itemEmpenhoSelecionadoId} onValueChange={setItemEmpenhoSelecionadoId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o item..." />
                            </SelectTrigger>
                            <SelectContent>
                                {itensEmpenho.map(it => (
                                    <SelectItem key={it.id} value={String(it.id)}>
                                        Item ID {it.id} (Vinculado à mesma ATA)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button 
            onClick={handleVincular} 
            disabled={loading || !itemEmpenhoSelecionadoId}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar Vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
