import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import type { Tables } from '../../supabaseTypes'
import { useAuth } from '../../AuthContext'
import { canToggleModoSesau } from '../../lib/permissions'
import { isNotaModoSesau } from '../../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Loader2, FileUp, XCircle } from 'lucide-react'
import { deleteDocument, replaceDocument } from '../../lib/storage'

type Nota = Tables<'notas'>

interface NotaFormModalProps {
  isOpen: boolean
  onClose: () => void
  notaToEdit?: Nota | null
  onSuccess: () => void
}

const STATUS_OPTIONS = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { value: 'CONCLUIDO', label: 'Concluído' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

const BR_STATES = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

function calculateInitialDays(targetDateStr?: string | null, refDateStr?: string | null) {
  if (!targetDateStr || !refDateStr) return ''
  const target = new Date(targetDateStr)
  const ref = new Date(refDateStr)
  if (isNaN(target.getTime()) || isNaN(ref.getTime())) return ''
  const diffTime = target.getTime() - ref.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString()
}

export function NotaFormModal({ isOpen, onClose, notaToEdit, onSuccess }: NotaFormModalProps) {
  const isEditing = !!notaToEdit
  const { profile } = useAuth()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    numero_ne: notaToEdit?.numero_ne ?? '',
    data_recebimento: notaToEdit?.data_recebimento ?? '',
    valor_total_teto: notaToEdit?.valor_total_teto?.toString() ?? '',
    status_geral: notaToEdit?.status_geral ?? 'PENDENTE',
    previsao_entrega: notaToEdit?.previsao_entrega ?? '',
    prazo_logistica_dias: '',
    uf: notaToEdit?.uf ?? '',
    modo_sesau: (notaToEdit?.modo_sesau || isNotaModoSesau(notaToEdit)) ?? false,
  })

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [removedFile, setRemovedFile] = useState(false)

  // Sincronizar formulário quando a nota para editar mudar
  useEffect(() => {
    if (isOpen) {
      setForm({
        numero_ne: notaToEdit?.numero_ne ?? '',
        data_recebimento: notaToEdit?.data_recebimento ?? '',
        valor_total_teto: notaToEdit?.valor_total_teto?.toString() ?? '',
        status_geral: notaToEdit?.status_geral ?? 'PENDENTE',
        previsao_entrega: notaToEdit?.previsao_entrega ?? '',
        prazo_logistica_dias: calculateInitialDays(notaToEdit?.previsao_entrega, notaToEdit?.data_recebimento),
        uf: notaToEdit?.uf ?? '',
        modo_sesau: (notaToEdit?.modo_sesau || isNotaModoSesau(notaToEdit)) ?? false,
      })
      setSelectedFile(null)
      setRemovedFile(false)
    }
  }, [isOpen, notaToEdit])
  // Lógica de cálculo automático de prazos
  useEffect(() => {
    if (!form.data_recebimento) return

    const baseDate = new Date(form.data_recebimento)
    if (isNaN(baseDate.getTime())) return

    const updates: Partial<typeof form> = {}

    if (form.prazo_logistica_dias) {
        const days = parseInt(form.prazo_logistica_dias)
        if (!isNaN(days)) {
            const resultDate = new Date(baseDate)
            resultDate.setDate(resultDate.getDate() + days)
            const dateStr = resultDate.toISOString().split('T')[0]
            if (form.previsao_entrega !== dateStr) {
                updates.previsao_entrega = dateStr
            }
        }
    }

    if (Object.keys(updates).length > 0) {
        setForm(prev => ({ ...prev, ...updates }))
    }
  }, [form.data_recebimento, form.prazo_logistica_dias])


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.numero_ne.trim()) {
      toast.warning('Número da NE é obrigatório.')
      return
    }
    setLoading(true)
    try {
      let arquivoCaminho = notaToEdit?.arquivo_caminho ?? null

      // Handle main empenho file
      if (removedFile && !selectedFile) {
        if (notaToEdit?.arquivo_caminho) {
          await deleteDocument(notaToEdit.arquivo_caminho)
          arquivoCaminho = null
        }
      } else if (selectedFile) {
        const { path, error: storageError } = await replaceDocument(
          notaToEdit?.arquivo_caminho, 
          selectedFile
        )
        if (storageError) throw storageError
        arquivoCaminho = path
      }

      const payload: any = {
        numero_ne: form.numero_ne.trim(),
        data_recebimento: form.data_recebimento || null,
        valor_total_teto: form.valor_total_teto ? parseFloat(form.valor_total_teto) : null,
        status_geral: form.status_geral || null,
        previsao_entrega: form.previsao_entrega || null,
        arquivo_caminho: arquivoCaminho,
        uf: form.uf || null,
        modo_sesau: form.modo_sesau || isNotaModoSesau(notaToEdit),
      }

      if (form.status_geral === 'CONCLUIDO' || form.status_geral === 'FATOR_CAIXA' || form.status_geral === 'CONCLUIDO_MANUAL') {
        payload.e_notificacao = false
      }

      if (isEditing) {
        const { error } = await supabase
          .from('notas')
          .update(payload)
          .eq('id', notaToEdit!.id)
        if (error) throw error
        toast.success('Nota de Empenho atualizada!')
      } else {
        const { error } = await supabase
          .from('notas')
          .insert(payload)
        if (error) throw error
        toast.success('Nota de Empenho criada!')
      }
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Erro ao salvar: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Nota de Empenho' : 'Nova Nota de Empenho'}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulário para edição dos dados da nota de empenho.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Número NE */}
            <div className="space-y-1.5">
              <Label htmlFor="numero_ne">Número da NE *</Label>
              <input
                id="numero_ne" name="numero_ne" required
                value={form.numero_ne} onChange={handleChange}
                placeholder="Ex: 2024NE001234"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            {/* Data Recebimento */}
            <div className="space-y-1.5">
              <Label htmlFor="data_recebimento" className="text-brand-accent font-bold">Data de Recebimento (Início do Prazo)</Label>
              <input
                id="data_recebimento" name="data_recebimento" type="date"
                value={form.data_recebimento} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border-2 border-brand-accent/30 dark:border-brand-accent/20 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
              />
            </div>
            {/* UF do Empenho */}
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF *</Label>
              <select
                id="uf" name="uf" required
                value={form.uf} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">Selecione...</option>
                {BR_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            {/* Prazo Macro (Entrega) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-blue-700 dark:text-blue-400 font-bold text-xs uppercase">Prazo Entrega (Macro/SLA)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-blue-600 font-bold uppercase">Dias:</span>
                  <input
                    type="number" name="prazo_logistica_dias" value={form.prazo_logistica_dias} onChange={handleChange}
                    className="w-12 h-6 text-xs text-center border border-blue-200 rounded bg-white text-zinc-900"
                    placeholder="SLA"
                  />
                </div>
              </div>
              <input
                id="previsao_entrega" name="previsao_entrega" type="date"
                value={form.previsao_entrega} onChange={handleChange}
                className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white/80 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            {/* Valor Total Teto */}
            <div className="space-y-1.5">
              <Label htmlFor="valor_total_teto">Valor Total (R$)</Label>
              <input
                id="valor_total_teto" name="valor_total_teto" type="number" step="0.01" min="0"
                value={form.valor_total_teto} onChange={handleChange}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="status_geral">Status Geral</Label>
              <select
                id="status_geral" name="status_geral"
                value={form.status_geral} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Modo SESAU */}
            {canToggleModoSesau(profile) && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100 dark:border-violet-900/30 sm:col-span-2">
                <input
                  type="checkbox"
                  id="modo_sesau"
                  name="modo_sesau"
                  checked={form.modo_sesau}
                  onChange={(e) => setForm(prev => ({ ...prev, modo_sesau: e.target.checked }))}
                  className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <div className="flex flex-col">
                  <Label htmlFor="modo_sesau" className="text-violet-700 dark:text-violet-400 font-bold text-xs uppercase cursor-pointer">
                    Modo SESAU
                  </Label>
                  <span className="text-[10px] text-zinc-500">Ativa tags especiais de completude física e financeira para este empenho</span>
                </div>
              </div>
            )}


            {/* Arquivo / Anexo */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Anexo (PDF Original)</Label>
              <div className="flex items-center gap-3 p-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900/40">
                {!selectedFile && notaToEdit?.arquivo_caminho && !removedFile ? (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <FileUp className="w-4 h-4 text-blue-500" />
                      <span>Arquivo já cadastrado</span>
                    </div>
                    <Button 
                      type="button" variant="ghost" size="sm" 
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setRemovedFile(true)}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {selectedFile && (
                      <button 
                        type="button" onClick={() => setSelectedFile(null)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Nota'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
