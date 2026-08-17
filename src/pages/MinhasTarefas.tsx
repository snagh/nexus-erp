import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { toast } from 'sonner'
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  AlertCircle,
  BarChart3 as ReportIcon
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import type { Tables } from '../supabaseTypes'

import { ExpandedItens } from '../components/Empenhos/ExpandedItens'

export function MinhasTarefas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cargas, setCargas] = useState<Tables<'notas'>[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const fetchMinhasCargas = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notas')
        .select('*, entidades(nome)')
        .eq('assigned_to', user.id)
        .order('distributed_at', { ascending: false })

      if (error) throw error
      setCargas(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error('Erro ao carregar suas tarefas: ' + message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user) fetchMinhasCargas()
  }, [user, fetchMinhasCargas])

  async function confirmarRecebimento(notaId: number) {
    try {
      const { error } = await supabase
        .from('notas')
        .update({ 
          confirmed_at: new Date().toISOString(),
          status_carga: 'EM_ANDAMENTO' 
        })
        .eq('id', notaId)

      if (error) throw error
      toast.success('Recebimento confirmado! Bom trabalho.')
      fetchMinhasCargas()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error('Erro ao confirmar: ' + message)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Minhas Tarefas</h1>
           <p className="text-zinc-500 text-sm">Gerenciamento de empenhos sob sua responsabilidade.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="hidden sm:flex gap-2 text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            onClick={() => navigate('/relatorios')}
          >
            <ReportIcon className="w-4 h-4 text-brand-accent" />
            Meus Relatórios
          </Button>
          <Badge variant="outline" className="px-3 py-1 bg-zinc-50 dark:bg-zinc-900 border-dashed">
            {cargas.filter(c => !c.confirmed_at).length} pendentes
          </Badge>
        </div>
      </div>

      {loading ? (
         <div className="py-20 flex justify-center text-zinc-400">Sincronizando suas cargas...</div>
      ) : (
        <div className="space-y-4">
          {cargas.length === 0 ? (
            <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/40 rounded-3xl border border-dashed text-zinc-400">
               <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
               <p>Você não possui cargas atribuídas no momento.</p>
            </div>
          ) : (
            cargas.map(carga => {
              const isPendente = !carga.confirmed_at
              const diffTime = carga.distributed_at ? Math.abs(new Date().getTime() - new Date(carga.distributed_at).getTime()) : 0
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

              return (
                <div key={carga.id} className="space-y-0">
                  <Card 
                    className={`group transition-all cursor-pointer backdrop-blur-sm ${isPendente ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/5 dark:bg-amber-950/5 shadow-md' : 'border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 opacity-90'} ${expandedId === carga.id ? 'rounded-b-none border-b-0' : ''}`}
                    onClick={() => setExpandedId(expandedId === carga.id ? null : carga.id)}
                  >
                    <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex-1 space-y-2">
                         <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${isPendente ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'}`}>
                               {isPendente ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                            </div>
                            <div>
                               <h3 className="font-bold text-lg leading-tight uppercase">{carga.numero_ne}</h3>
                               <p className="text-xs text-zinc-500 line-clamp-1">{(carga as any).entidades?.nome || carga.emissor}</p>
                            </div>
                         </div>
                      </div>
  
                      <div className="flex items-center gap-10">
                         <div className="text-center">
                            <p className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Dias na Carga</p>
                            <span className={`text-sm font-bold block ${diffDays > 3 && isPendente ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}`}>
                               {diffDays} {diffDays === 1 ? 'dia' : 'dias'}
                            </span>
                         </div>
  
                          {isPendente ? (
                             <Button 
                               onClick={(e) => { e.stopPropagation(); confirmarRecebimento(carga.id); }}
                               className="bg-brand-accent hover:opacity-90 text-primary-foreground font-bold px-6 shadow-lg shadow-brand-accent/20"
                             >
                               Confirmar Recebimento
                             </Button>
                         ) : (
                            <div className="text-center opacity-60">
                               <p className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Recebido em</p>
                               <span className="text-xs font-medium">
                                  {carga.confirmed_at ? new Date(carga.confirmed_at).toLocaleDateString() : '---'}
                               </span>
                            </div>
                         )}
  
                         <Button variant="ghost" size="icon" className="group-hover:translate-x-1 transition-transform">
                            <ChevronRight className={`w-4 h-4 text-zinc-300 transition-transform ${expandedId === carga.id ? 'rotate-90 text-brand-accent' : ''}`} />
                         </Button>
                      </div>
                    </CardContent>
                  </Card>
                  {expandedId === carga.id && (
                    <div className="border border-t-0 border-zinc-200 dark:border-zinc-800 rounded-b-3xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                      <ExpandedItens notaId={carga.id} numeroNe={carga.numero_ne} />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {!loading && cargas.length > 0 && (
         <div className="p-4 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl flex items-center justify-between text-foreground/80">
            <div className="flex items-center gap-3 text-sm">
               <AlertCircle className="w-4 h-4 text-brand-accent" />
               Confirme o recebimento assim que conferir o documento original.
            </div>
            <a 
              href="https://github.com/snagh/controle-vendas-publicas/blob/main/docs/onboarding_guide.md" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-brand-accent text-xs hover:underline font-bold"
            >
              Manual de Boas Práticas
            </a>
         </div>
      )}
    </div>
  )
}
