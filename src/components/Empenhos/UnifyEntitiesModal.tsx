import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { mergeEntidades, fetchEntidades } from '../../lib/supabaseHelpers'
import { useAuth } from '../../AuthContext'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { 
  Search, 
  AlertTriangle,
  Loader2,
  GitMerge,
  Info
} from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function UnifyEntitiesModal({ isOpen, onClose, onSuccess }: Props) {
  const [entidades, setEntidades] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [targetName, setTargetName] = useState('')
  const [targetId, setTargetId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const { profile } = useAuth()

  useEffect(() => {
    if (isOpen) {
      loadEntidades()
    }
  }, [isOpen])

  const loadEntidades = async () => {
    setLoading(true)
    const { data } = await fetchEntidades()
    setEntidades(data || [])
    setLoading(false)
  }

  const filtered = entidades.filter(e => 
    e.nome.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleSelect = (id: number, name: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (targetId === id) {
          setTargetId(null)
          setTargetName('')
        }
      } else {
        next.add(id)
        // Auto-select as target if none selected
        if (!targetId) {
          setTargetId(id)
          setTargetName(name)
        }
      }
      return next
    })
  }

  const handleMerge = async () => {
    if (!targetName.trim()) {
        toast.error('Informe o nome correto final.')
        return
    }
    if (selectedIds.size < 1) {
        toast.error('Selecione ao menos uma entidade.')
        return
    }
    if (!targetId) {
        toast.error('Selecione uma entidade principal para receber os dados.')
        return
    }

    const sourceIds = Array.from(selectedIds).filter(id => id !== targetId)
    const isSingle = selectedIds.size === 1
    const confirmMsg = isSingle 
        ? `Você irá renomear a entidade para "${targetName}" e atualizar todos os seus empenhos no banco de dados. Confirma?`
        : `Atenção: Você irá mover todos os empenhos das ${sourceIds.length} entidades selecionadas para "${targetName}" e EXCLUIR os duplicados. Confirma?`

    if (confirm(confirmMsg)) {
        setProcessing(true)
        try {
            // Se o nome alvo for diferente do nome da entidade principal, atualizamos ela primeiro
            if (targetName !== entidades.find(e => e.id === targetId)?.nome) {
                await supabase.from('entidades').update({ nome: targetName }).eq('id', targetId)
            }

            const { error } = await mergeEntidades(targetId, targetName, sourceIds, { id: profile?.id || '', email: profile?.email || '' })
            
            if (error) throw error
            
            toast.success('Entidades unificadas com sucesso!')
            onSuccess()
            onClose()
        } catch (err: any) {
            toast.error('Erro ao unificar: ' + err.message)
        } finally {
            setProcessing(false)
        }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <GitMerge className="w-5 h-5" /> Unificar Entidades (Modo DEV)
          </DialogTitle>
          <p className="text-sm text-zinc-500">
            Mova empenhos e atas de múltiplas entidades para uma única e remova as duplicatas.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-medium">
                    UTILIZE COM CAUTELA. Esta ação altera vínculos de banco de dados e apaga registros de entidades duplicados permanentemente.
                </p>
            </div>

            <div className="space-y-2">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-600 mt-0.5" />
                    <p className="text-[11px] text-amber-800 font-medium">
                        DICA: Para apenas renomear e sincronizar os nomes de uma entidade no banco de dados, selecione apenas uma e mude o nome final.
                    </p>
                </div>

                <Label className="text-xs font-bold uppercase">1. Selecionar Entidades</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <Input 
                        placeholder="Buscar entidade..." 
                        className="pl-9 h-9 text-xs"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <ScrollArea className="h-[250px] border rounded-md p-2 bg-zinc-50/50">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map(ent => (
                                <div 
                                    key={ent.id} 
                                    className={`flex items-center justify-between p-2 rounded hover:bg-zinc-100 transition-colors ${selectedIds.has(ent.id) ? 'bg-zinc-100 border-l-2 border-blue-600' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox"
                                            id={`ent-${ent.id}`} 
                                            checked={selectedIds.has(ent.id)}
                                            onChange={() => toggleSelect(ent.id, ent.nome)}
                                            className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex flex-col">
                                            <label htmlFor={`ent-${ent.id}`} className="text-xs font-bold cursor-pointer">{ent.nome}</label>
                                            <span className="text-[10px] text-zinc-500 uppercase">{ent.municipio} - {ent.estado}</span>
                                        </div>
                                    </div>
                                    {selectedIds.has(ent.id) && (
                                        <Button 
                                            variant={targetId === ent.id ? 'default' : 'outline'} 
                                            size="sm" 
                                            className="h-7 text-[10px]"
                                            onClick={() => { setTargetId(ent.id); setTargetName(ent.nome) }}
                                        >
                                            {targetId === ent.id ? 'DESTINO principal' : 'marcar como DESTINO'}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
                <div className="text-[10px] text-zinc-500 font-medium">
                    {selectedIds.size} entidade(s) selecionada(s).
                </div>
            </div>

            {selectedIds.size >= 2 && (
                <div className="space-y-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <Label className="text-xs font-bold uppercase text-blue-700">2. Nome Final da Entidade</Label>
                    <Input 
                        placeholder="Digite o nome correto final..." 
                        className="h-9 text-xs border-blue-200"
                        value={targetName}
                        onChange={e => setTargetName(e.target.value)}
                    />
                    <p className="text-[9px] text-blue-600">
                        Todos os empenhos selecionados serão renomeados para este valor.
                    </p>
                </div>
            )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={processing}>Cancelar</Button>
          <Button 
            variant="destructive" 
            onClick={handleMerge} 
            disabled={processing || selectedIds.size < 2 || !targetName}
            className="font-bold gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            CONFIRMAR UNIFICAÇÃO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
