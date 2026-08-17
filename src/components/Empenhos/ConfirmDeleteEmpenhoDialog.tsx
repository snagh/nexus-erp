import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface ConfirmDeleteEmpenhoDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (justificativa: string) => void | Promise<void>
  numeroNE?: string
}

export function ConfirmDeleteEmpenhoDialog({
  isOpen,
  onClose,
  onConfirm,
  numeroNE = ""
}: ConfirmDeleteEmpenhoDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [loading, setLoading] = useState(false)

  const handleVerifyAndConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (inputValue.trim().toLowerCase() !== 'deletar') {
      toast.error('Digite "deletar" corretamente para continuar.')
      return
    }

    if (!justificativa.trim()) {
      toast.error('Informe a justificativa para a exclusão do empenho.')
      return
    }
    
    setLoading(true)
    try {
      await onConfirm(justificativa.trim())
      setInputValue('')
      setJustificativa('')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-650 font-bold uppercase text-sm flex-wrap text-red-600">
            <ShieldCheck className="w-5 h-5 text-red-500" />
            Confirmar Exclusão de Empenho
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Para confirmar a exclusão permanente do empenho {numeroNE}, preencha as informações obrigatórias abaixo. Esta ação é irreversível.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerifyAndConfirm} className="space-y-4 py-2 text-zinc-800 dark:text-zinc-200">
          <div className="space-y-2">
            <Label htmlFor="justificativa-exclusao-empenho" className="text-xs font-bold uppercase text-zinc-400">
              Justificativa / Motivo da Exclusão
            </Label>
            <Textarea
              id="justificativa-exclusao-empenho"
              placeholder="Descreva detalhadamente o motivo para excluir este empenho..."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              className="border-zinc-200 dark:border-zinc-800 text-xs resize-none h-20"
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="security-confirm-empenho" className="text-xs font-bold uppercase text-zinc-400">
              Confirmação de Segurança
            </Label>
            <Input
              id="security-confirm-empenho"
              type="text"
              placeholder='Digite "deletar" para confirmar...'
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="border-zinc-200 dark:border-zinc-800 text-xs"
              disabled={loading}
              required
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-650 shrink-0 mt-0.5 text-red-500" />
            <p className="text-[11px] text-red-850 dark:text-red-400">
              Esta ação removerá o empenho permanentemente. Eventuais solicitações vinculadas (que já devem estar excluídas) perderão o vínculo físico, mas guardarão este motivo para auditoria.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={onClose} 
              disabled={loading}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="destructive" 
              disabled={loading}
              className="gap-2 text-xs"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar e Excluir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
