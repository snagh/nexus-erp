import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface SecurityConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  description?: string
  actionLabel?: string
  variant?: 'destructive' | 'default'
  confirmationMode?: 'password' | 'word'
  requiredWord?: string
}

export function SecurityConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmar Autorização",
  description = "Para realizar esta ação crítica, confirme sua identidade digitando sua senha.",
  actionLabel = "Confirmar e Executar",
  variant = "destructive",
  confirmationMode = 'password',
  requiredWord = 'deletar'
}: SecurityConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleVerifyAndConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (confirmationMode === 'word') {
      if (inputValue.trim().toLowerCase() !== requiredWord.toLowerCase()) {
        toast.error(`Digite "${requiredWord}" corretamente para continuar.`)
        return
      }
      
      setLoading(true)
      try {
        await onConfirm()
        setInputValue('')
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
      return
    }

    // Fluxo de Senha
    if (!inputValue) {
      toast.error('Digite sua senha para continuar.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Usuário não autenticado.')

      // Tenta o login com a senha fornecida para validar a identidade
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: inputValue
      })

      if (error) {
        throw new Error('Senha incorreta. Verifique e tente novamente.')
      }

      // Se passou, executa a ação e fecha
      await onConfirm()
      setInputValue('')
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldCheck className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerifyAndConfirm} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="security-confirm">
              {confirmationMode === 'password' ? 'Sua Senha Atual' : `Digite "${requiredWord}" para confirmar`}
            </Label>
            <Input
              id="security-confirm"
              type={confirmationMode === 'password' ? 'password' : 'text'}
              placeholder={confirmationMode === 'password' ? 'Digite sua senha...' : `Digite ${requiredWord}...`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              className="border-zinc-200 dark:border-zinc-800"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-800 dark:text-red-400">
                Esta é uma ação irreversível que será registrada nos logs de auditoria do sistema.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
                type="button" 
                variant="ghost" 
                onClick={onClose} 
                disabled={loading}
            >
                Cancelar
            </Button>
            <Button 
                type="submit" 
                variant={variant} 
                disabled={loading}
                className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
