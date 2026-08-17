import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Loader2 } from 'lucide-react'

interface Entity {
  id: number
  nome: string
  estado: string | null
  municipio: string | null
}

interface EditEntityModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  entity: Entity | null
}

export function EditEntityModal({ isOpen, onClose, onSuccess, entity }: EditEntityModalProps) {
  const [nome, setNome] = useState('')
  const [estado, setEstado] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (entity) {
      setNome(entity.nome || '')
      setEstado(entity.estado || '')
      setMunicipio(entity.municipio || '')
    }
  }, [entity])

  async function handleSave() {
    if (!entity) return
    if (!nome.trim()) {
      toast.error('O nome da entidade é obrigatório.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('entidades')
        .update({
          nome: nome.trim(),
          estado: estado.trim().toUpperCase() || null,
          municipio: municipio.trim() || null
        })
        .eq('id', entity.id)

      if (error) throw error

      toast.success('Entidade atualizada com sucesso!')
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Erro ao atualizar entidade:', error)
      toast.error('Erro ao atualizar entidade: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            Editar Cadastro do Cliente
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="nome">Nome da Entidade / Órgão</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: FMS de Teresina"
            />
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            <div className="grid gap-2 col-span-1">
              <Label htmlFor="estado">UF</Label>
              <Input
                id="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="PI"
                maxLength={2}
              />
            </div>
            <div className="grid gap-2 col-span-3">
              <Label htmlFor="municipio">Município (Opcional)</Label>
              <Input
                id="municipio"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                placeholder="Ex: Teresina"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-brand-accent hover:opacity-90 text-white shadow-lg shadow-brand-accent/20 font-bold transition-all">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
