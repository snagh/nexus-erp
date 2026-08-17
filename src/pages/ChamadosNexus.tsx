import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { toast } from 'sonner'
import { getCleanPublicUrl, uploadDocument } from '../lib/storage'
import { logAction } from '../lib/logger'
import {
  HelpCircle,
  PlusCircle,
  CheckCircle2,
  Clock,
  Paperclip,
  Search,
  ExternalLink,
  ShieldCheck,
  Send,
  Loader2,
  Bug,
  Lightbulb,
  HelpCircle as QuestionIcon,
  Sparkles,
  RefreshCw,
  User,
  Flame,
  XCircle
} from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Textarea } from '../components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('pt-BR')
}

export interface ChamadoNexus {
  id: number
  created_at: string
  solicitante_id: string | null
  usuario_nome: string
  usuario_email: string | null
  usuario_setor: string | null
  tipo: 'BUG' | 'MELHORIA' | 'DUVIDA' | 'RECURSO'
  modulo: 'EMPENHOS' | 'COMPRAS' | 'VENDAS' | 'ATAS' | 'BAIXAS' | 'RELATORIOS' | 'OUTRO'
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
  titulo: string
  descricao: string
  anexo_caminho: string | null
  status: 'PENDENTE' | 'EM_ANALISE' | 'EM_DESENVOLVIMENTO' | 'CONCLUIDO' | 'RECUSADO'
  resposta_dev: string | null
  data_resposta: string | null
  data_conclusao: string | null
}

export function ChamadosNexus() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState<boolean>(true)
  const [chamados, setChamados] = useState<ChamadoNexus[]>([])

  const isDevOrAdmin = profile?.nivel === 'DEV' || profile?.nivel === 'ADM'

  // Aba ativa: 'NOVO', 'MEUS', 'TRIAGEM' (Triagem só para DEV/ADM)
  const [activeTab, setActiveTab] = useState<'NOVO' | 'MEUS' | 'TRIAGEM'>('NOVO')

  // Form de Novo Chamado
  const [formTipo, setFormTipo] = useState<'BUG' | 'MELHORIA' | 'DUVIDA' | 'RECURSO'>('MELHORIA')
  const [formModulo, setFormModulo] = useState<'EMPENHOS' | 'COMPRAS' | 'VENDAS' | 'ATAS' | 'BAIXAS' | 'RELATORIOS' | 'OUTRO'>('EMPENHOS')
  const [formPrioridade, setFormPrioridade] = useState<'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'>('MEDIA')
  const [formTitulo, setFormTitulo] = useState<string>('')
  const [formDescricao, setFormDescricao] = useState<string>('')
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false)

  // Filtros da Central de Triagem
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterPrioridade, setFilterPrioridade] = useState<string>('ALL')
  const [filterTipo, setFilterTipo] = useState<string>('ALL')
  const [filterModulo, setFilterModulo] = useState<string>('ALL')

  // Modal de Atendimento / Resposta do DEV
  const [editChamado, setEditChamado] = useState<ChamadoNexus | null>(null)
  const [editStatus, setEditStatus] = useState<'PENDENTE' | 'EM_ANALISE' | 'EM_DESENVOLVIMENTO' | 'CONCLUIDO' | 'RECUSADO'>('PENDENTE')
  const [editPrioridade, setEditPrioridade] = useState<'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'>('MEDIA')
  const [editRespostaDev, setEditRespostaDev] = useState<string>('')
  const [savingEdit, setSavingEdit] = useState<boolean>(false)

  // Se o nível simulado mudar e não for DEV/ADM, redireciona da aba TRIAGEM para MEUS
  useEffect(() => {
    if (!isDevOrAdmin && activeTab === 'TRIAGEM') {
      setActiveTab('MEUS')
    }
  }, [isDevOrAdmin, activeTab])

  // 2. Carregar Lista de Chamados
  const fetchChamados = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('chamados_nexus')
        .select('*')
        .order('id', { ascending: false })

      if (error) {
        // Se a tabela ainda não existir no Supabase, evita crash
        console.warn('Aviso chamados_nexus:', error.message)
        setChamados([])
      } else if (data) {
        setChamados(data as ChamadoNexus[])
      }
    } catch (err: any) {
      console.error('Erro ao carregar chamados:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChamados()
  }, [])

  // 3. Submeter Novo Chamado
  const handleSubmitChamado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitulo.trim()) {
      toast.error('Informe o título do chamado.')
      return
    }
    if (!formDescricao.trim()) {
      toast.error('Descreva os detalhes da sua solicitação.')
      return
    }

    try {
      setFormSubmitting(true)
      const { data: { user } } = await supabase.auth.getUser()

      // Upload do material de apoio se houver
      let anexoPath = null
      if (formFile) {
        toast.info('Enviando arquivo de anexo...')
        const { path, error: uploadErr } = await uploadDocument(formFile)
        if (uploadErr) throw uploadErr
        anexoPath = path
      }

      const payload = {
        solicitante_id: user?.id || null,
        usuario_nome: profile?.display_name || user?.email || 'Usuário NEXUS',
        usuario_email: user?.email || profile?.email || null,
        usuario_setor: profile?.setor || 'GERAL',
        tipo: formTipo,
        modulo: formModulo,
        prioridade: formPrioridade,
        titulo: formTitulo.trim(),
        descricao: formDescricao.trim(),
        anexo_caminho: anexoPath,
        status: 'PENDENTE',
        resposta_dev: null,
        data_resposta: null,
        data_conclusao: null
      }

      const { data, error } = await supabase
        .from('chamados_nexus')
        .insert([payload])
        .select()
        .single()

      if (error) throw error

      await logAction('CRIAR_CHAMADO_NEXUS', 'chamados_nexus', String(data?.id || 0), payload)

      toast.success('Chamado / Sugestão registrado com sucesso! O desenvolvedor foi notificado.')

      // Limpa formulário
      setFormTitulo('')
      setFormDescricao('')
      setFormFile(null)
      setFormTipo('MELHORIA')
      setFormModulo('EMPENHOS')
      setFormPrioridade('MEDIA')

      fetchChamados()
      setActiveTab('MEUS')
    } catch (err: any) {
      toast.error('Erro ao registrar chamado: ' + err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  // 4. Salvar Edição / Resposta do DEV
  const handleOpenEditModal = (ch: ChamadoNexus) => {
    setEditChamado(ch)
    setEditStatus(ch.status)
    setEditPrioridade(ch.prioridade)
    setEditRespostaDev(ch.resposta_dev || '')
  }

  const handleSaveDevEdit = async () => {
    if (!editChamado) return

    try {
      setSavingEdit(true)
      const now = new Date().toISOString()
      const isConcluido = editStatus === 'CONCLUIDO' || editStatus === 'RECUSADO'

      const updates: any = {
        status: editStatus,
        prioridade: editPrioridade,
        resposta_dev: editRespostaDev.trim() || null,
        data_resposta: editRespostaDev.trim() ? now : editChamado.data_resposta,
        data_conclusao: isConcluido ? (editChamado.data_conclusao || now) : null
      }

      const { error } = await supabase
        .from('chamados_nexus')
        .update(updates)
        .eq('id', editChamado.id)

      if (error) throw error

      await logAction('ATUALIZAR_CHAMADO_NEXUS', 'chamados_nexus', String(editChamado.id), updates)

      toast.success('Status e resposta do chamado atualizados com sucesso!')
      setEditChamado(null)
      fetchChamados()
    } catch (err: any) {
      toast.error('Erro ao atualizar chamado: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // Estatísticas do Painel
  const stats = useMemo(() => {
    const total = chamados.length
    const pendentes = chamados.filter(c => c.status === 'PENDENTE').length
    const emAnalise = chamados.filter(c => c.status === 'EM_ANALISE').length
    const emDesenvolvimento = chamados.filter(c => c.status === 'EM_DESENVOLVIMENTO').length
    const concluidos = chamados.filter(c => c.status === 'CONCLUIDO').length
    const recusados = chamados.filter(c => c.status === 'RECUSADO').length
    const criticos = chamados.filter(c => c.prioridade === 'CRITICA' && c.status !== 'CONCLUIDO' && c.status !== 'RECUSADO').length

    // Métrica por Tipo (Ideias vs Problemas vs Dúvidas vs Recursos)
    const melhorias = chamados.filter(c => c.tipo === 'MELHORIA').length
    const bugs = chamados.filter(c => c.tipo === 'BUG').length
    const duvidas = chamados.filter(c => c.tipo === 'DUVIDA').length
    const recursos = chamados.filter(c => c.tipo === 'RECURSO').length

    const pctMelhorias = total > 0 ? Math.round((melhorias / total) * 100) : 0
    const pctBugs = total > 0 ? Math.round((bugs / total) * 100) : 0
    const pctConcluidos = total > 0 ? Math.round((concluidos / total) * 100) : 0

    return {
      total,
      pendentes,
      emAnalise,
      emDesenvolvimento,
      concluidos,
      recusados,
      criticos,
      melhorias,
      bugs,
      duvidas,
      recursos,
      pctMelhorias,
      pctBugs,
      pctConcluidos
    }
  }, [chamados])

  // Chamados do usuário atual
  const meusChamados = useMemo(() => {
    if (!profile?.id && !profile?.email) return chamados
    return chamados.filter(c => c.solicitante_id === profile?.id || (profile?.email && c.usuario_email === profile?.email))
  }, [chamados, profile])

  // Chamados filtrados para a Central de Triagem DEV
  const chamadosFiltradosTriagem = useMemo(() => {
    return chamados.filter(c => {
      // Busca por palavra-chave
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchTitulo = c.titulo.toLowerCase().includes(term)
        const matchDesc = c.descricao.toLowerCase().includes(term)
        const matchUser = c.usuario_nome.toLowerCase().includes(term)
        const matchId = String(c.id).includes(term)
        if (!matchTitulo && !matchDesc && !matchUser && !matchId) return false
      }

      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false
      if (filterPrioridade !== 'ALL' && c.prioridade !== filterPrioridade) return false
      if (filterTipo !== 'ALL' && c.tipo !== filterTipo) return false
      if (filterModulo !== 'ALL' && c.modulo !== filterModulo) return false

      return true
    })
  }, [chamados, searchTerm, filterStatus, filterPrioridade, filterTipo, filterModulo])

  const renderBadgeTipo = (tipo: string) => {
    switch (tipo) {
      case 'BUG':
        return <Badge className="bg-red-500/10 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50 text-[10px] font-bold gap-1"><Bug className="w-3 h-3" /> ERRO / BUG</Badge>
      case 'MELHORIA':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50 text-[10px] font-bold gap-1"><Lightbulb className="w-3 h-3" /> MELHORIA</Badge>
      case 'DUVIDA':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50 text-[10px] font-bold gap-1"><QuestionIcon className="w-3 h-3" /> DÚVIDA</Badge>
      case 'RECURSO':
        return <Badge className="bg-purple-500/10 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50 text-[10px] font-bold gap-1"><Sparkles className="w-3 h-3" /> NOVO RECURSO</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] font-bold">{tipo}</Badge>
    }
  }

  const renderBadgePrioridade = (prio: string) => {
    switch (prio) {
      case 'CRITICA':
        return <Badge className="bg-red-600 text-white font-black text-[9px] uppercase tracking-wider animate-pulse flex items-center gap-1"><Flame className="w-3 h-3" /> CRÍTICA</Badge>
      case 'ALTA':
        return <Badge className="bg-orange-500 text-white font-bold text-[9px] uppercase tracking-wider">ALTA</Badge>
      case 'MEDIA':
        return <Badge className="bg-blue-600 text-white font-bold text-[9px] uppercase tracking-wider">MÉDIA</Badge>
      case 'BAIXA':
        return <Badge variant="secondary" className="text-zinc-600 dark:text-zinc-400 font-medium text-[9px] uppercase tracking-wider">BAIXA</Badge>
      default:
        return <Badge variant="outline" className="text-[9px] font-bold">{prio}</Badge>
    }
  }

  const renderBadgeStatus = (st: string) => {
    switch (st) {
      case 'PENDENTE':
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 text-[10px] font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> AGUARDANDO TRIAGEM</Badge>
      case 'EM_ANALISE':
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800 text-[10px] font-bold flex items-center gap-1"><Search className="w-3 h-3" /> EM ANÁLISE</Badge>
      case 'EM_DESENVOLVIMENTO':
        return <Badge className="bg-purple-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm"><Loader2 className="w-3 h-3 animate-spin text-white" /> EM DESENVOLVIMENTO</Badge>
      case 'CONCLUIDO':
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-[10px] font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> CONCLUÍDO</Badge>
      case 'RECUSADO':
        return <Badge className="bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-800 text-[10px] font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> FORA DE ESCOPO / ARQUIVADO</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] font-bold">{st}</Badge>
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-accent to-purple-600 text-white flex items-center justify-center shadow-lg shadow-brand-accent/20">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight flex items-center gap-2">
                Central de Chamados & Sugestões NEXUS
              </h1>
              <p className="text-zinc-500 text-xs font-medium mt-0.5">
                Canal oficial para relatar erros, sugerir melhorias e acompanhar o fluxo de desenvolvimento do NEXUS.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchChamados}
            className="h-10 text-xs font-bold rounded-xl gap-2 border-zinc-200 dark:border-zinc-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            onClick={() => setActiveTab('NOVO')}
            className="h-10 text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-blue-600/20 gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Chamado
          </Button>
        </div>
      </div>

      {/* Cards de Métricas / Fila */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-white dark:bg-zinc-900/60 p-4 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Total de Chamados</span>
          <div className="text-2xl font-black text-zinc-800 dark:text-zinc-100 mt-1 font-mono">{stats.total}</div>
        </Card>

        <Card className="bg-amber-500/5 dark:bg-amber-500/10 p-4 border border-amber-500/20 rounded-2xl">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Aguardando Triagem</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">{stats.pendentes}</div>
        </Card>

        <Card className="bg-purple-500/5 dark:bg-purple-500/10 p-4 border border-purple-500/20 rounded-2xl">
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Em Desenvolvimento</span>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">{stats.emDesenvolvimento}</div>
        </Card>

        <Card className="bg-emerald-500/5 dark:bg-emerald-500/10 p-4 border border-emerald-500/20 rounded-2xl">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Concluídos</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{stats.concluidos}</div>
        </Card>

        <Card className="bg-red-500/5 dark:bg-red-500/10 p-4 border border-red-500/20 rounded-2xl">
          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block">Críticos Pendentes</span>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1 font-mono">{stats.criticos}</div>
        </Card>

        <Card className="bg-zinc-100 dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Arquivados</span>
          <div className="text-2xl font-black text-zinc-500 mt-1 font-mono">{stats.recusados}</div>
        </Card>
      </div>

      {/* Painel de Métricas & Distribuição (Ideias vs Problemas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
              Sugestões de Melhoria
            </span>
            <Badge className="bg-amber-600 text-white text-[9px] font-black">{stats.pctMelhorias}%</Badge>
          </div>
          <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1 font-mono">{stats.melhorias} <span className="text-xs font-normal text-amber-600">ideias</span></div>
          <div className="w-full bg-amber-200/60 dark:bg-amber-900/50 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.pctMelhorias}%` }} />
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20 p-4 border border-red-200/80 dark:border-red-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <Bug className="w-3.5 h-3.5 text-red-600" />
              Erros / Bugs Relatados
            </span>
            <Badge className="bg-red-600 text-white text-[9px] font-black">{stats.pctBugs}%</Badge>
          </div>
          <div className="text-2xl font-black text-red-900 dark:text-red-200 mt-1 font-mono">{stats.bugs} <span className="text-xs font-normal text-red-600">falhas</span></div>
          <div className="w-full bg-red-200/60 dark:bg-red-900/50 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-red-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.pctBugs}%` }} />
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/20 p-4 border border-purple-200/80 dark:border-purple-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Novas Telas & Recursos
            </span>
            <Badge className="bg-purple-600 text-white text-[9px] font-black">{stats.recursos} reqs</Badge>
          </div>
          <div className="text-2xl font-black text-purple-900 dark:text-purple-200 mt-1 font-mono">{stats.recursos} <span className="text-xs font-normal text-purple-600">projetos</span></div>
          <div className="text-[10px] text-purple-600 font-bold mt-2">Dúvidas de Uso: {stats.duvidas}</div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 border border-emerald-200/80 dark:border-emerald-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Taxa de Resolução DEV
            </span>
            <Badge className="bg-emerald-600 text-white text-[9px] font-black">{stats.pctConcluidos}%</Badge>
          </div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-1 font-mono">{stats.concluidos} / {stats.total}</div>
          <div className="w-full bg-emerald-200/60 dark:bg-emerald-900/50 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.pctConcluidos}%` }} />
          </div>
        </Card>
      </div>

      {/* Navegação por Abas */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('NOVO')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'NOVO' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          <PlusCircle className="w-4 h-4" />
          Abrir Chamado / Sugestão
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MEUS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'MEUS' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          <User className="w-4 h-4" />
          Meus Chamados ({meusChamados.length})
        </button>

        {isDevOrAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('TRIAGEM')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'TRIAGEM' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40'}`}
          >
            <ShieldCheck className="w-4 h-4" />
            Central de Triagem DEV ({stats.pendentes + stats.emAnalise + stats.emDesenvolvimento})
          </button>
        )}
      </div>

      {/* CONTEÚDO DA ABA 1: FORMULÁRIO DE NOVO CHAMADO */}
      {activeTab === 'NOVO' && (
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-3xl p-6 sm:p-8 max-w-3xl mx-auto">
          <form onSubmit={handleSubmitChamado} className="space-y-6">
            <div className="border-b pb-4 border-zinc-100 dark:border-zinc-800">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                Registrar Solicitação ou Relatar Erro
              </h3>
              <p className="text-xs text-zinc-500 font-medium mt-1">
                Preencha os detalhes abaixo. Sua solicitação entrará diretamente na fila de prioridades do desenvolvedor.
              </p>
            </div>

            {/* Tipo e Módulo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Tipo de Solicitação *
                </Label>
                <Select value={formTipo} onValueChange={(v: any) => setFormTipo(v)}>
                  <SelectTrigger className="h-11 font-bold text-xs bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MELHORIA" className="text-xs font-bold">💡 SUGESTÃO DE MELHORIA</SelectItem>
                    <SelectItem value="BUG" className="text-xs font-bold">🐞 ERRO / BUG (ALGO QUEBROU)</SelectItem>
                    <SelectItem value="DUVIDA" className="text-xs font-bold">❓ DÚVIDA / AJUDA NO SISTEMA</SelectItem>
                    <SelectItem value="RECURSO" className="text-xs font-bold">🚀 NOVO RECURSO / NOVA TELA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Módulo do NEXUS *
                </Label>
                <Select value={formModulo} onValueChange={(v: any) => setFormModulo(v)}>
                  <SelectTrigger className="h-11 font-bold text-xs bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPENHOS" className="text-xs font-bold">📦 EMPENHOS / NOTAS</SelectItem>
                    <SelectItem value="COMPRAS" className="text-xs font-bold">🛒 MÓDULO DE COMPRAS</SelectItem>
                    <SelectItem value="VENDAS" className="text-xs font-bold">📈 PORTAL DO VENDEDOR</SelectItem>
                    <SelectItem value="ATAS" className="text-xs font-bold">📄 ATAS / ARPS / LICITAÇÕES</SelectItem>
                    <SelectItem value="BAIXAS" className="text-xs font-bold">🚚 BAIXAS (NF / PEDIDO)</SelectItem>
                    <SelectItem value="RELATORIOS" className="text-xs font-bold">📊 RELATÓRIOS & DASHBOARD</SelectItem>
                    <SelectItem value="OUTRO" className="text-xs font-bold">⚙️ OUTROS / SISTEMA GERAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prioridade Sugerida e Título */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Prioridade Sugerida *
                </Label>
                <Select value={formPrioridade} onValueChange={(v: any) => setFormPrioridade(v)}>
                  <SelectTrigger className="h-11 font-bold text-xs bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA" className="text-xs font-bold">🟢 BAIXA (PODE AGUARDAR)</SelectItem>
                    <SelectItem value="MEDIA" className="text-xs font-bold">🔵 MÉDIA (IMPORTANTE)</SelectItem>
                    <SelectItem value="ALTA" className="text-xs font-bold">🟠 ALTA (URGENTE PARA A ROTINA)</SelectItem>
                    <SelectItem value="CRITICA" className="text-xs font-bold text-red-600">🔴 CRÍTICA (TRAVA O TRABALHO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="ch_titulo" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Título Resumido *
                </Label>
                <Input
                  id="ch_titulo"
                  type="text"
                  value={formTitulo}
                  onChange={e => setFormTitulo(e.target.value)}
                  placeholder="Ex: Adicionar filtro por cidade na lista de empenhos..."
                  className="h-11 text-xs font-medium bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl"
                  required
                />
              </div>
            </div>

            {/* Descrição Detalhada */}
            <div className="space-y-1.5">
              <Label htmlFor="ch_desc" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                Descrição Detalhada *
              </Label>
              <Textarea
                id="ch_desc"
                rows={5}
                value={formDescricao}
                onChange={e => setFormDescricao(e.target.value)}
                placeholder="Explique o que precisa ser feito ou descreva o erro com detalhes (o que você estava fazendo, qual valor ou botão clicou)..."
                className="text-xs font-medium bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl leading-relaxed"
                required
              />
            </div>

            {/* Anexo / Material de Apoio */}
            <div className="p-4 border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/20 dark:bg-blue-950/20 rounded-2xl space-y-2">
              <Label className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-blue-600" />
                Material de Apoio (Print do Erro, PDF ou Documento Opcional)
              </Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setFormFile(e.target.files?.[0] || null)}
                className="text-xs bg-white dark:bg-zinc-950 cursor-pointer"
              />
              <p className="text-[10px] text-zinc-400 font-medium">
                💡 Prints da tela ajudam o desenvolvedor a resolver seu chamado muito mais rápido!
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <Button
                type="submit"
                disabled={formSubmitting || !formTitulo.trim() || !formDescricao.trim()}
                className="h-12 px-8 text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-blue-600/20 gap-2 disabled:opacity-50"
              >
                {formSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando Solicitação...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar para Fila de Dev
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* CONTEÚDO DA ABA 2: MEUS CHAMADOS */}
      {activeTab === 'MEUS' && (
        <div className="space-y-4">
          {meusChamados.length === 0 ? (
            <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-3xl">
              <HelpCircle className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 uppercase">Nenhum chamado aberto por você</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-4">
                Quando você tiver uma ideia de melhoria ou encontrar algum problema no sistema, clique no botão para registrar seu chamado.
              </p>
              <Button
                onClick={() => setActiveTab('NOVO')}
                className="h-10 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                Abrir Meu Primeiro Chamado
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {meusChamados.map(ch => (
                <Card key={ch.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black font-mono text-zinc-400">#{ch.id}</span>
                      {renderBadgeTipo(ch.tipo)}
                      {renderBadgePrioridade(ch.prioridade)}
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">{ch.modulo}</Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      {renderBadgeStatus(ch.status)}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-zinc-900 dark:text-white">{ch.titulo}</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap leading-relaxed">
                      {ch.descricao}
                    </p>
                  </div>

                  {/* Anexo de Apoio */}
                  {ch.anexo_caminho && (
                    <div className="pt-1">
                      <a
                        href={getCleanPublicUrl(ch.anexo_caminho)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900/50"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        Ver Material de Apoio Anexado
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Resposta do Dev */}
                  {ch.resposta_dev && (
                    <div className="p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-900/50 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                          Parecer do Desenvolvedor (DEV)
                        </span>
                        <span>{ch.data_resposta ? formatDisplayDate(ch.data_resposta) : ''}</span>
                      </div>
                      <p className="text-xs font-medium text-purple-950 dark:text-purple-200 italic whitespace-pre-wrap">
                        &ldquo;{ch.resposta_dev}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="text-[10px] font-bold text-zinc-400 pt-1 flex justify-between items-center">
                    <span>Aberto em {new Date(ch.created_at).toLocaleString('pt-BR')}</span>
                    {ch.data_conclusao && <span>Concluído em {new Date(ch.data_conclusao).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: CENTRAL DE TRIAGEM DEV / ADM */}
      {activeTab === 'TRIAGEM' && isDevOrAdmin && (
        <div className="space-y-6">
          {/* Barra de Filtros */}
          <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl space-y-3">
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar chamados por título, usuário ou palavra-chave..."
                  className="pl-9 h-10 text-xs font-medium bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto shrink-0">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-10 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">TODOS OS STATUS</SelectItem>
                    <SelectItem value="PENDENTE" className="text-xs font-bold">AGUARDANDO TRIAGEM</SelectItem>
                    <SelectItem value="EM_ANALISE" className="text-xs font-bold">EM ANÁLISE</SelectItem>
                    <SelectItem value="EM_DESENVOLVIMENTO" className="text-xs font-bold">EM DESENVOLVIMENTO</SelectItem>
                    <SelectItem value="CONCLUIDO" className="text-xs font-bold">CONCLUÍDOS</SelectItem>
                    <SelectItem value="RECUSADO" className="text-xs font-bold">ARQUIVADOS / RECUSADOS</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
                  <SelectTrigger className="h-10 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">TODAS PRIORIDADES</SelectItem>
                    <SelectItem value="CRITICA" className="text-xs font-bold text-red-600">🔴 CRÍTICA</SelectItem>
                    <SelectItem value="ALTA" className="text-xs font-bold text-orange-600">🟠 ALTA</SelectItem>
                    <SelectItem value="MEDIA" className="text-xs font-bold text-blue-600">🔵 MÉDIA</SelectItem>
                    <SelectItem value="BAIXA" className="text-xs font-bold text-zinc-500">🟢 BAIXA</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="h-10 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">TODOS OS TIPOS</SelectItem>
                    <SelectItem value="BUG" className="text-xs font-bold">🐞 ERRO / BUG</SelectItem>
                    <SelectItem value="MELHORIA" className="text-xs font-bold">💡 MELHORIA</SelectItem>
                    <SelectItem value="DUVIDA" className="text-xs font-bold">❓ DÚVIDA</SelectItem>
                    <SelectItem value="RECURSO" className="text-xs font-bold">🚀 NOVO RECURSO</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterModulo} onValueChange={setFilterModulo}>
                  <SelectTrigger className="h-10 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue placeholder="Módulo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">TODOS MÓDULOS</SelectItem>
                    <SelectItem value="EMPENHOS" className="text-xs font-bold">EMPENHOS</SelectItem>
                    <SelectItem value="COMPRAS" className="text-xs font-bold">COMPRAS</SelectItem>
                    <SelectItem value="VENDAS" className="text-xs font-bold">VENDAS</SelectItem>
                    <SelectItem value="ATAS" className="text-xs font-bold">ATAS</SelectItem>
                    <SelectItem value="BAIXAS" className="text-xs font-bold">BAIXAS</SelectItem>
                    <SelectItem value="RELATORIOS" className="text-xs font-bold">RELATÓRIOS</SelectItem>
                    <SelectItem value="OUTRO" className="text-xs font-bold">OUTRO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Tabela de Gestão de Fila */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">
                Exibindo {chamadosFiltradosTriagem.length} chamados na Fila de Triagem
              </span>
            </div>

            {chamadosFiltradosTriagem.length === 0 ? (
              <Card className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-400">
                Nenhum chamado encontrado para os filtros selecionados.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {chamadosFiltradosTriagem.map(ch => (
                  <Card
                    key={ch.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm hover:border-purple-300 dark:hover:border-purple-800 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black font-mono text-purple-600 dark:text-purple-400">#{ch.id}</span>
                        {renderBadgeTipo(ch.tipo)}
                        {renderBadgePrioridade(ch.prioridade)}
                        <Badge variant="outline" className="text-[10px] font-bold uppercase">{ch.modulo}</Badge>
                        <span className="text-[11px] font-bold text-zinc-500">
                          👤 {ch.usuario_nome} ({ch.usuario_setor || 'N/A'})
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {renderBadgeStatus(ch.status)}
                        <Button
                          size="sm"
                          onClick={() => handleOpenEditModal(ch)}
                          className="h-8 text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white rounded-lg gap-1.5 shadow-sm"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Atender / Responder
                        </Button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-zinc-900 dark:text-white">{ch.titulo}</h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap leading-relaxed line-clamp-3">
                        {ch.descricao}
                      </p>
                    </div>

                    {ch.anexo_caminho && (
                      <div>
                        <a
                          href={getCleanPublicUrl(ch.anexo_caminho)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Paperclip className="w-3 h-3" />
                          Material de Apoio Anexado
                        </a>
                      </div>
                    )}

                    {ch.resposta_dev && (
                      <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 rounded-xl text-xs space-y-0.5">
                        <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                          Parecer DEV Atual:
                        </span>
                        <p className="text-zinc-700 dark:text-zinc-300 italic">
                          &ldquo;{ch.resposta_dev}&rdquo;
                        </p>
                      </div>
                    )}

                    <div className="text-[10px] font-bold text-zinc-400 flex justify-between items-center pt-1">
                      <span>Criado em {new Date(ch.created_at).toLocaleString('pt-BR')}</span>
                      <span>Email: {ch.usuario_email || 'N/A'}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE ATENDIMENTO / RESPOSTA DO DEV */}
      <Dialog open={!!editChamado} onOpenChange={open => { if (!open) setEditChamado(null) }}>
        <DialogContent className="sm:max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-3xl p-6">
          <DialogHeader className="border-b pb-3 border-zinc-100 dark:border-zinc-800">
            <DialogTitle className="text-lg font-black uppercase text-zinc-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              Atender Chamado #{editChamado?.id}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Atualize o status, prioridade e envie o parecer técnico para o solicitante.
            </DialogDescription>
          </DialogHeader>

          {editChamado && (
            <div className="space-y-4 py-3 text-xs">
              {/* Resumo do Chamado */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                <div className="font-extrabold text-zinc-800 dark:text-zinc-200">{editChamado.titulo}</div>
                <div className="text-[10px] text-zinc-400">
                  Solicitado por <strong>{editChamado.usuario_nome}</strong> ({editChamado.usuario_setor}) em {new Date(editChamado.created_at).toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Alterar Status */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Novo Status *
                  </Label>
                  <Select value={editStatus} onValueChange={(val: any) => setEditStatus(val)}>
                    <SelectTrigger className="h-10 font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDENTE" className="text-xs font-bold">🟡 AGUARDANDO TRIAGEM</SelectItem>
                      <SelectItem value="EM_ANALISE" className="text-xs font-bold">🔵 EM ANÁLISE</SelectItem>
                      <SelectItem value="EM_DESENVOLVIMENTO" className="text-xs font-bold">🟣 EM DESENVOLVIMENTO</SelectItem>
                      <SelectItem value="CONCLUIDO" className="text-xs font-bold">🟢 CONCLUÍDO (DEPLOY)</SelectItem>
                      <SelectItem value="RECUSADO" className="text-xs font-bold">⚪ RECUSADO / ARQUIVADO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Alterar Prioridade */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Prioridade Definida *
                  </Label>
                  <Select value={editPrioridade} onValueChange={(val: any) => setEditPrioridade(val)}>
                    <SelectTrigger className="h-10 font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BAIXA" className="text-xs font-bold">🟢 BAIXA</SelectItem>
                      <SelectItem value="MEDIA" className="text-xs font-bold">🔵 MÉDIA</SelectItem>
                      <SelectItem value="ALTA" className="text-xs font-bold">🟠 ALTA</SelectItem>
                      <SelectItem value="CRITICA" className="text-xs font-bold text-red-600">🔴 CRÍTICA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Parecer / Resposta do DEV */}
              <div className="space-y-1.5">
                <Label htmlFor="edit_resposta" className="text-xs font-bold text-purple-700 dark:text-purple-300">
                  Parecer Técnico do DEV / Justificativa *
                </Label>
                <Textarea
                  id="edit_resposta"
                  rows={4}
                  value={editRespostaDev}
                  onChange={e => setEditRespostaDev(e.target.value)}
                  placeholder="Escreva a resposta para o usuário (ex: 'Filtro criado e disponibilizado no deploy de hoje', 'Agendado para o próximo sprint')..."
                  className="text-xs font-medium border-purple-200 dark:border-purple-900 focus-visible:ring-purple-500 leading-relaxed"
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditChamado(null)}
              disabled={savingEdit}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveDevEdit}
              disabled={savingEdit}
              className="h-10 text-xs font-black bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-2 shadow-lg shadow-purple-600/20"
            >
              {savingEdit ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando Parecer...
                </>
              ) : (
                'Salvar Parecer e Status'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
