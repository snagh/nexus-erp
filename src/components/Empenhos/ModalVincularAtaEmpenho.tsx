import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Loader2, Link as LinkIcon, PackageCheck } from 'lucide-react'
import { logAction } from '../../lib/logger'

interface ModalVincularAtaEmpenhoProps {
  nota: any
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ModalVincularAtaEmpenho({ nota, isOpen, onClose, onSuccess }: ModalVincularAtaEmpenhoProps) {
  const [loadingAtas, setLoadingAtas] = useState(false)
  const [atasOptions, setAtasOptions] = useState<any[]>([])
  const [selectedAtaId, setSelectedAtaId] = useState<string>('none')
  
  const [loadingItensAta, setLoadingItensAta] = useState(false)
  const [itensAtaList, setItensAtaList] = useState<any[]>([])
  
  // Mapeamento local dos itens do empenho para itens_ata: itemId -> itemAtaId (ou 'none')
  const [itemMapping, setItemMapping] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && nota) {
      const initialAtaId = nota.ata_id ? String(nota.ata_id) : 'none'
      setSelectedAtaId(initialAtaId)
      fetchAtas(nota.entidade_id)
    }
  }, [isOpen, nota])

  async function fetchAtas(entidadeId?: number | null) {
    setLoadingAtas(true)
    try {
      let query = supabase.from('atas').select('id, numero_arp, entidade_gerenciadora, uf, data_validade, objeto_ata').order('created_at', { ascending: false })
      if (entidadeId) {
        query = query.eq('entidade_id', entidadeId)
      }
      const { data, error } = await query
      if (error) throw error

      setAtasOptions(data || [])
    } catch (err: any) {
      console.error('Erro ao buscar atas para vínculo:', err)
      toast.error('Erro ao buscar Atas disponíveis.')
    } finally {
      setLoadingAtas(false)
    }
  }

  // Quando a Ata selecionada muda, busca os itens daquela Ata e faz o auto-match
  useEffect(() => {
    if (!selectedAtaId || selectedAtaId === 'none') {
      setItensAtaList([])
      setItemMapping({})
      return
    }

    async function loadItensAta() {
      setLoadingItensAta(true)
      try {
        const { data, error } = await supabase
          .from('itens_ata')
          .select('id, numero_item, descricao, unidade, quantidade_registrada, valor_unitario, marca, mapeamento_ia')
          .eq('ata_id', selectedAtaId)
        
        if (error) throw error
        const itemsAta = data || []
        setItensAtaList(itemsAta)

        // Realizar Auto-Match inteligente dos itens do Empenho
        const newMapping: Record<number, string> = {}
        const notaItens = nota?.itens || []

        notaItens.forEach((it: any) => {
          // Se o item já tiver item_ata_id e pertencer a essa ata, pré-seleciona
          if (it.item_ata_id) {
            const exists = itemsAta.some(ia => ia.id === it.item_ata_id)
            if (exists) {
              newMapping[it.id] = String(it.item_ata_id)
              return
            }
          }

          // 1. Match por codigo_mapeamento_ia / mapeamento_ia
          let matched = itemsAta.find(ia => 
            ia.mapeamento_ia && it.mapeamento_ia && String(ia.mapeamento_ia).trim() === String(it.mapeamento_ia).trim()
          )

          // 2. Match por igualdade de número de item
          if (!matched && it.numero_item) {
            matched = itemsAta.find(ia => String(ia.numero_item) === String(it.numero_item))
          }

          // 3. Match por descrição idêntica
          if (!matched && it.descricao) {
            const descEmp = it.descricao.trim().toLowerCase()
            matched = itemsAta.find(ia => (ia.descricao || '').trim().toLowerCase() === descEmp)
          }

          // 4. Match por inclusão de texto de descrição
          if (!matched && it.descricao) {
            const descEmp = it.descricao.trim().toLowerCase()
            matched = itemsAta.find(ia => 
              (ia.descricao || '').toLowerCase().includes(descEmp) || descEmp.includes((ia.descricao || '').toLowerCase())
            )
          }

          newMapping[it.id] = matched ? String(matched.id) : 'none'
        })

        setItemMapping(newMapping)
      } catch (err: any) {
        console.error('Erro ao carregar itens da ata:', err)
        toast.error('Erro ao carregar itens da Ata selecionada.')
      } finally {
        setLoadingItensAta(false)
      }
    }

    loadItensAta()
  }, [selectedAtaId, nota])

  const handleSaveVinculo = async () => {
    setSaving(true)
    try {
      const newAtaId = selectedAtaId === 'none' ? null : selectedAtaId

      // 1. Atualiza ata_id na tabela notas (Empenho)
      const { error: errNota } = await supabase
        .from('notas')
        .update({ ata_id: newAtaId })
        .eq('id', nota.id)
      
      if (errNota) throw errNota

      // 2. Atualiza item_ata_id em cada item do empenho e em historico_entregas
      const notaItens = nota?.itens || []
      for (const itemEmp of notaItens) {
        const mappedVal = itemMapping[itemEmp.id]
        const newItemAtaId = (newAtaId && mappedVal && mappedVal !== 'none') ? Number(mappedVal) : null

        // Atualiza item do empenho
        const { error: errItem } = await supabase
          .from('itens')
          .update({ item_ata_id: newItemAtaId })
          .eq('id', itemEmp.id)

        if (errItem) console.warn(`Erro ao atualizar item_ata_id do item #${itemEmp.id}:`, errItem)

        // Atualiza registros de historico_entregas (baixas existentes por NF/DAV) vinculados a este item
        const { error: errHist } = await supabase
          .from('historico_entregas')
          .update({ item_ata_id: newItemAtaId })
          .eq('item_id', itemEmp.id)

        if (errHist) console.warn(`Erro ao atualizar historico_entregas para o item #${itemEmp.id}:`, errHist)
      }

      await logAction('VINCULAR_ATA_EMPENHO', 'notas', nota.id, {
        numero_ne: nota.numero_ne,
        ata_id: newAtaId,
        itens_mapeados_count: Object.values(itemMapping).filter(v => v !== 'none').length
      })

      toast.success(newAtaId ? 'Empenho vinculado à Ata com sucesso!' : 'Empenho desvinculado da Ata.')
      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Erro ao salvar vínculo de Ata:', err)
      toast.error('Erro ao salvar vínculo: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!nota) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <LinkIcon className="w-5 h-5 text-brand-accent" />
            Vincular Empenho #{nota.numero_ne} à Ata de Registro de Preços
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Selecione uma Ata para associar este empenho e mapear seus itens. O vínculo atualizará dinamicamente o saldo reservado (baixa suave) e as baixas por NF na Ata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Dados do Empenho */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div>
              <span className="font-bold text-zinc-400 uppercase text-[10px] block">Órgão / Emissor</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{nota.emissor || nota.entidade?.nome || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-zinc-400 uppercase text-[10px] block">Teto do Empenho</span>
              <span className="font-black text-brand-accent">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nota.valor_total_teto || 0)}
              </span>
            </div>
            <div>
              <span className="font-bold text-zinc-400 uppercase text-[10px] block">Total de Itens</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300">{nota.itens?.length || 0} itens</span>
            </div>
          </div>

          {/* Seleção de Ata */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block">
              Ata de Registro de Preços (ARP)
            </label>
            {loadingAtas ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando Atas ativas...
              </div>
            ) : (
              <Select value={selectedAtaId} onValueChange={setSelectedAtaId}>
                <SelectTrigger className="w-full bg-white dark:bg-zinc-950 h-10 text-xs">
                  <SelectValue placeholder="Selecione uma Ata..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma Ata (Sem Vínculo)</SelectItem>
                  {atasOptions.map(ata => (
                    <SelectItem key={ata.id} value={String(ata.id)}>
                      ARP nº {ata.numero_arp} — {ata.entidade_gerenciadora || 'Sem Órgão'} {ata.uf ? `(${ata.uf})` : ''} {ata.objeto_ata ? `• ${ata.objeto_ata}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Mapeamento dos Itens do Empenho -> Itens da Ata */}
          {selectedAtaId !== 'none' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-purple-500" />
                  Mapeamento dos Itens do Empenho
                </h4>
                {loadingItensAta && (
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando itens da Ata...
                  </span>
                )}
              </div>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                    <tr>
                      <th className="p-2.5">Item Empenho</th>
                      <th className="p-2.5">Qtd / Unit.</th>
                      <th className="p-2.5">Correspondente na Ata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {(!nota.itens || nota.itens.length === 0) ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-zinc-400 italic">
                          Nenhum item cadastrado neste empenho.
                        </td>
                      </tr>
                    ) : (
                      nota.itens.map((item: any) => {
                        const currentMappedId = itemMapping[item.id] || 'none'
                        return (
                          <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                            <td className="p-2.5 font-medium max-w-[280px]">
                              <div className="line-clamp-2">{item.descricao}</div>
                              <span className="text-[10px] text-zinc-400 font-mono">{item.unidade} {item.marca ? `• Marca: ${item.marca}` : ''}</span>
                            </td>
                            <td className="p-2.5 font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                              <div>{item.quantidade} {item.unidade}</div>
                              <div className="text-[10px] text-brand-accent font-bold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario || 0)}
                              </div>
                            </td>
                            <td className="p-2.5">
                              <Select
                                value={currentMappedId}
                                onValueChange={(val) => setItemMapping(prev => ({ ...prev, [item.id]: val }))}
                              >
                                <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-zinc-950 border-purple-200 dark:border-purple-900 w-full max-w-[320px]">
                                  <SelectValue placeholder="Selecione o item correspondente..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Não vincular a item específico</SelectItem>
                                  {itensAtaList.map(ia => (
                                    <SelectItem key={ia.id} value={String(ia.id)}>
                                      Item #{ia.numero_item}: {ia.descricao.slice(0, 45)}... ({ia.quantidade_registrada} {ia.unidade})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            size="sm" 
            onClick={handleSaveVinculo} 
            disabled={saving}
            className="bg-brand-accent hover:opacity-90 text-white font-bold gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
            {saving ? 'Salvando Vínculo...' : 'Salvar Vínculo com a Ata'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
